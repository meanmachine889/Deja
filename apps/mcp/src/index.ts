#!/usr/bin/env -S npx tsx
// Déjà MCP server (stdio). Gives any MCP client a long-term memory that supersedes stale facts,
// forgets noise, and explains where every memory came from.
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { basename } from 'node:path';
import {
  createDeja,
  Deja,
  HashEmbedder,
  HeuristicJudge,
  KINDS,
  loadConfig,
  MemoryStore,
  normalizeProject,
  type Ctx,
  type Memory,
  type RecallHit,
} from '@deja/core';

// DEJA_OFFLINE=1 runs against an in-process store: no Appwrite, nothing persisted. For protocol tests.
const offline = process.env.DEJA_OFFLINE === '1';
const config = offline
  ? { ownerId: 'offline', project: normalizeProject(process.env.DEJA_PROJECT || basename(process.env.INIT_CWD || process.cwd())) }
  : loadConfig();
const deja = offline
  ? new Deja({
      store: new MemoryStore(),
      embedder: new HashEmbedder(),
      judge: new HeuristicJudge({ duplicate: 0.06, candidate: 0.6, update: 0.5, related: 0.3 }),
      thresholds: { duplicate: 0.06, candidate: 0.6, update: 0.5, related: 0.3 },
    })
  : createDeja(loadConfig());
const sessionId = randomUUID();

const server = new McpServer(
  { name: 'deja', version: '0.1.0' },
  {
    instructions: `Déjà is your long-term memory across sessions for the user and this project.
- At the start of a task, call recall with what you're about to work on.
- Before assuming anything about the user's stack, preferences, conventions, or past decisions, call recall.
- When the user tells you a durable fact, preference, decision or convention, or one changes, call remember.
  Déjà detects when new information replaces old information and supersedes it automatically.
- If remember or recall reports a conflict, ask the user which is right, then call resolve_conflict.
- Use why to explain to the user where a memory came from.`,
  },
);

// ------------------------------------------------------------------ context

let heartbeatAt = 0;
function ctx(project?: string): Ctx {
  if (!config.ownerId) {
    throw new Error('DEJA_OWNER_ID is not set. Sign in on the Déjà dashboard and copy your owner id into .env.');
  }
  const agent = server.server.getClientVersion()?.name ?? 'unknown-agent';
  return { ownerId: config.ownerId, sessionId, agent: agent.slice(0, 64), project: project ? normalizeProject(project) : config.project };
}

async function withCtx<T>(project: string | undefined, fn: (c: Ctx) => Promise<T>): Promise<T> {
  const c = ctx(project);
  const now = Date.now();
  if (now - heartbeatAt > 30_000) {
    const first = heartbeatAt === 0;
    heartbeatAt = now;
    deja.heartbeat(c, first).catch((err) => console.error('[deja] heartbeat failed:', err.message));
  }
  return fn(c);
}

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const fail = (err: unknown) => ({ ...text(`Déjà error: ${(err as Error).message}`), isError: true });
const pct = (r: number) => `${Math.round(r * 100)}%`;
const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};

function formatMemory(m: Memory) {
  return `"${m.content}" [${m.kind}] · id ${m.id} · from ${m.agent}, ${ago(m.createdAt)}`;
}

function formatHit(h: RecallHit, i: number) {
  const lines = [`${i + 1}. ${formatMemory(h.memory)} · retention ${pct(h.retention)} · recalled ${h.memory.recallCount}×`];
  for (const c of h.conflictsWith) lines.push(`   ⚠ conflicts with "${c.content}" (id ${c.id}). Confirm with the user before relying on either.`);
  return lines.join('\n');
}

const projectArg = z
  .string()
  .optional()
  .describe(`Project namespace. Defaults to "${config.project}". Use "global" for memories that apply everywhere.`);

// ------------------------------------------------------------------ tools

server.registerTool(
  'remember',
  {
    title: 'Remember',
    description:
      'Store durable knowledge: facts about the project, user preferences, decisions, conventions, people, notable events. ' +
      'Pass natural language; long text is split into atomic memories. If it replaces something Déjà already knew ' +
      '(e.g. a migration or changed preference) the old memory is superseded automatically.',
    inputSchema: {
      content: z.string().min(3).describe('What to remember, in plain language. Self-contained; resolve "it"/"this".'),
      kind: z.enum(KINDS).optional().describe('Optional; inferred when omitted.'),
      project: projectArg,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  async ({ content, kind, project }) => {
    try {
      const res = await withCtx(project, (c) => deja.remember(c, { content, kind, project: c.project }));
      return text(res.summary);
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  'recall',
  {
    title: 'Recall',
    description:
      'Search long-term memory by meaning. Returns the most relevant still-true memories ranked by similarity and ' +
      'retention, with provenance and conflict warnings. Superseded and faded memories are excluded. Recalling a ' +
      'memory strengthens it.',
    inputSchema: {
      query: z.string().min(2).describe('What you want to know, e.g. "which database do we use".'),
      k: z.number().int().min(1).max(20).optional().describe('How many memories (default 5).'),
      project: projectArg,
      includeFaded: z.boolean().optional().describe('Also return memories that have mostly been forgotten.'),
    },
    annotations: { readOnlyHint: false },
  },
  async ({ query, k, project, includeFaded }) => {
    try {
      const hits = await withCtx(project, (c) => deja.recall(c, { query, k, includeFaded, project: c.project }));
      if (hits.length === 0) return text(`No memories about "${query}" yet.`);
      return text(hits.map(formatHit).join('\n'));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  'why',
  {
    title: 'Why do you know this?',
    description:
      'Explain a memory: who stored it and when, the original excerpt, what it replaced, what replaced it, and related memories.',
    inputSchema: { memoryId: z.string().describe('Memory id from recall or remember.') },
    annotations: { readOnlyHint: true },
  },
  async ({ memoryId }) => {
    try {
      const w = await withCtx(undefined, (c) => deja.why(c, memoryId));
      const lines = [
        formatMemory(w.memory),
        `Status: ${w.memory.status} · retention ${pct(w.retention)} · recalled ${w.memory.recallCount}× · stability ${w.memory.stability.toFixed(1)} days`,
        `Stored by ${w.memory.agent} in session ${w.memory.sessionId.slice(0, 8)} on ${new Date(w.memory.createdAt).toUTCString()}`,
      ];
      if (w.memory.excerpt) lines.push(`Original words: "${w.memory.excerpt}"`);
      for (const m of w.replaced) lines.push(`Replaced: "${m.content}" (${ago(m.createdAt)})`);
      for (const m of w.replacedBy) lines.push(`Replaced by: "${m.content}" (${ago(m.createdAt)})`);
      for (const { link, other } of w.links.filter((l) => l.link.type !== 'supersedes')) {
        lines.push(`${link.type}${link.resolved ? '' : ' (open)'}: "${other.content}" — ${link.reason}`);
      }
      return text(lines.join('\n'));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  'forget',
  {
    title: 'Forget',
    description: 'Forget a memory the user asked you to drop or that is wrong. It stops appearing in recall.',
    inputSchema: { memoryId: z.string() },
    annotations: { destructiveHint: true },
  },
  async ({ memoryId }) => {
    try {
      const m = await withCtx(undefined, (c) => deja.forget(c, memoryId));
      return text(`Forgot "${m.content}".`);
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  'conflicts',
  {
    title: 'Open conflicts',
    description: 'List pairs of memories that contradict each other and still need the user to decide which is true.',
    inputSchema: { project: projectArg },
    annotations: { readOnlyHint: true },
  },
  async ({ project }) => {
    try {
      const list = await withCtx(project, (c) => deja.conflicts(c, c.project));
      if (list.length === 0) return text('No open conflicts.');
      return text(
        list
          .map((x, i) => `${i + 1}. linkId ${x.link.id}\n   A (${x.a.id}): "${x.a.content}"\n   B (${x.b.id}): "${x.b.content}"\n   Why: ${x.link.reason}`)
          .join('\n'),
      );
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  'resolve_conflict',
  {
    title: 'Resolve conflict',
    description: 'After the user decides, keep one side of a conflict. The other side is superseded.',
    inputSchema: { linkId: z.string(), keepMemoryId: z.string() },
    annotations: { destructiveHint: false },
  },
  async ({ linkId, keepMemoryId }) => {
    try {
      const r = await withCtx(undefined, (c) => deja.resolve(c, linkId, keepMemoryId));
      return text(`Kept "${r.kept.content}". Superseded "${r.dropped.content}".`);
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  'timeline',
  {
    title: 'Memory timeline',
    description: 'What changed in memory recently: stored, recalled, superseded, conflicts, resolutions.',
    inputSchema: { project: projectArg, limit: z.number().int().min(1).max(100).optional() },
    annotations: { readOnlyHint: true },
  },
  async ({ project, limit }) => {
    try {
      const events = await withCtx(project, (c) => deja.timeline(c, { project: c.project, limit: limit ?? 20 }));
      if (events.length === 0) return text('Nothing has happened yet.');
      return text(
        events
          .map((e) => {
            const d = e.detail as Record<string, string>;
            const what = d.content ?? d.to ?? d.kept ?? d.query ?? d.a ?? '';
            return `${e.createdAt.slice(0, 16).replace('T', ' ')} · ${e.agent} · ${e.type}${what ? ` · "${what}"` : ''}`;
          })
          .join('\n'),
      );
    } catch (err) {
      return fail(err);
    }
  },
);

// ------------------------------------------------------------------ prompt

server.registerPrompt(
  'deja_bootstrap',
  {
    title: 'Load project memory',
    description: 'Prime the conversation with what Déjà knows about this project.',
    argsSchema: { focus: z.string().optional() },
  },
  async ({ focus }) => {
    const hits = await withCtx(undefined, (c) =>
      deja.recall(c, { query: focus ?? `${c.project} stack, conventions, decisions and preferences`, k: 12 }),
    );
    const body = hits.length
      ? hits.map(formatHit).join('\n')
      : 'Déjà has no memories for this project yet. Remember durable facts as you learn them.';
    return {
      messages: [{ role: 'user', content: { type: 'text', text: `Here is what you remember about this project:\n${body}` } }],
    };
  },
);

await server.connect(new StdioServerTransport());
console.error(`[deja] MCP server ready · project ${config.project} · judge ${deja.judge.name} · session ${sessionId.slice(0, 8)}`);
