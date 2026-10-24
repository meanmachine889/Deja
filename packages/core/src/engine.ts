import { randomUUID } from 'node:crypto';
import { INITIAL_STABILITY, isFaded, recallScore, reinforcedStability, retention } from './decay.ts';
import { DEFAULT_THRESHOLDS, type Candidate, type Judge, type Thresholds, type Verdict } from './judge.ts';
import type { Embedder, Store } from './store.ts';
import type { Ctx, EventType, Kind, Link, Memory, MemoryEvent, Session } from './types.ts';

export interface DejaDeps {
  store: Store;
  embedder: Embedder;
  judge: Judge;
  now?: () => Date;
  /** Multiplies elapsed time in the forgetting curve. 1440 => one real minute ages memories a day. */
  timeWarp?: number;
  thresholds?: Thresholds;
}

export interface RememberOutcome {
  memory: Memory;
  action: 'created' | 'reinforced';
  /** `agent`: the caller said so via `replaces`. `judge`: Déjà inferred it. */
  superseded: { memory: Memory; reason: string; via: 'agent' | 'judge' }[];
  conflicts: { link: Link; other: Memory }[];
  supports: Memory[];
}

export interface RememberResult {
  outcomes: RememberOutcome[];
  /** `replaces` ids that couldn't be applied (unknown, not yours, or already inactive). */
  skipped: { id: string; why: string }[];
  summary: string;
}

export interface RememberInput {
  content: string;
  project?: string;
  kind?: Kind;
  excerpt?: string;
  /**
   * Ids of memories the caller knows this new information makes outdated, usually ones it just
   * recalled. They're superseded directly, without asking the judge. This lets the agent's own
   * understanding drive revisions; the judge still checks everything else.
   */
  replaces?: string[];
  /** Why the replaced memories are outdated, shown in history. */
  reason?: string;
}

export interface RecallHit {
  memory: Memory;
  score: number;
  distance: number;
  /** Retention at the moment of recall, before this recall reinforced it. */
  retention: number;
  conflictsWith: Memory[];
}

export interface WhyResult {
  memory: Memory;
  retention: number;
  session: Session | null;
  /** Memories this one replaced, newest first. */
  replaced: Memory[];
  /** Memories that replaced this one, oldest first. */
  replacedBy: Memory[];
  links: { link: Link; other: Memory }[];
  events: MemoryEvent[];
}

export interface Conflict {
  link: Link;
  a: Memory;
  b: Memory;
}

export interface Graph {
  memories: (Memory & { retention: number })[];
  links: Link[];
}

const sameScope = (a: string, b: string) => a === b || a === 'global' || b === 'global';
const quote = (s: string, n = 80) => `"${s.length > n ? `${s.slice(0, n - 1)}…` : s}"`;

export class Deja {
  readonly store: Store;
  private embedder: Embedder;
  readonly judge: Judge;
  private now: () => Date;
  readonly timeWarp: number;
  private t: Thresholds;

  constructor(deps: DejaDeps) {
    this.store = deps.store;
    this.embedder = deps.embedder;
    this.judge = deps.judge;
    this.now = deps.now ?? (() => new Date());
    this.timeWarp = deps.timeWarp ?? 1;
    this.t = deps.thresholds ?? DEFAULT_THRESHOLDS;
  }

  retentionOf(memory: Memory, at = this.now()): number {
    return retention(memory.stability, memory.lastReinforcedAt, at, this.timeWarp);
  }

  // ---------------------------------------------------------------- remember

  async remember(ctx: Ctx, input: RememberInput): Promise<RememberResult> {
    const project = input.project ?? ctx.project;
    const { replaced, skipped } = await this.resolveReplaces(ctx, input.replaces ?? []);
    const atoms = await this.judge.extract(input.content, input.kind);
    if (atoms.length === 0) return { outcomes: [], skipped, summary: 'Nothing durable to remember.' };

    const vectors = await this.embedder.embed(atoms.map((a) => a.content));
    const forcedByAtom = await this.assignReplaced(atoms.map((a) => a.content), vectors, replaced);
    const reason = input.reason?.trim() || `${ctx.agent} reported this replaces it.`;

    const outcomes: RememberOutcome[] = [];
    for (const [i, atom] of atoms.entries()) {
      outcomes.push(
        await this.rememberAtom(
          ctx,
          {
            ...atom,
            project,
            vector: vectors[i]!,
            excerpt: input.excerpt ?? (atoms.length > 1 || atom.content !== input.content ? input.content : null),
          },
          { memories: forcedByAtom[i] ?? [], reason },
        ),
      );
    }
    return { outcomes, skipped, summary: summarize(outcomes, skipped, ctx.agent) };
  }

  /** Validate `replaces` ids: they must exist, belong to the caller, and still be active. */
  private async resolveReplaces(ctx: Ctx, ids: string[]) {
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    const found = new Map((await this.store.getMemories(unique)).map((m) => [m.id, m]));
    const replaced: Memory[] = [];
    const skipped: { id: string; why: string }[] = [];
    for (const id of unique) {
      const m = found.get(id);
      if (!m || m.ownerId !== ctx.ownerId) skipped.push({ id, why: 'no such memory' });
      else if (m.status !== 'active') skipped.push({ id, why: `already ${m.status}` });
      else replaced.push(m);
    }
    return { replaced, skipped };
  }

  /** With several atoms, each replaced memory goes to the atom it's semantically closest to. */
  private async assignReplaced(contents: string[], vectors: number[][], replaced: Memory[]): Promise<Memory[][]> {
    const byAtom: Memory[][] = contents.map(() => []);
    if (replaced.length === 0) return byAtom;
    if (contents.length === 1) {
      byAtom[0] = replaced;
      return byAtom;
    }
    const oldVectors = await this.embedder.embed(replaced.map((m) => m.content));
    replaced.forEach((m, j) => {
      let best = 0;
      let bestD = Infinity;
      vectors.forEach((v, i) => {
        const d = cosine(oldVectors[j]!, v);
        if (d < bestD) [best, bestD] = [i, d];
      });
      byAtom[best]!.push(m);
    });
    return byAtom;
  }

  private async rememberAtom(
    ctx: Ctx,
    atom: { content: string; kind: Kind; project: string; vector: number[]; excerpt: string | null },
    forced: { memories: Memory[]; reason: string },
  ): Promise<RememberOutcome> {
    const forcedIds = new Set(forced.memories.map((m) => m.id));
    // Memories the caller already declared outdated are not candidates for "same" or the judge.
    const close = (await this.neighbours(ctx.ownerId, atom.vector, atom.project)).filter(
      (c) => c.distance < this.t.candidate && !forcedIds.has(c.memory.id),
    );

    let outcome: RememberOutcome;
    let verdicts: Verdict[] = [];
    const best = close[0];
    if (best && best.distance < this.t.duplicate) {
      outcome = await this.reinforcedOutcome(ctx, best.memory, 'reinforced', { content: atom.content });
    } else {
      verdicts = await this.judge.relate(
        atom.content,
        close.map<Candidate>((c) => ({ id: c.memory.id, content: c.memory.content, createdAt: c.memory.createdAt, distance: c.distance })),
      );
      const same = verdicts.find((v) => v.relation === 'same');
      const sameMemory = same && close.find((c) => c.memory.id === same.id)?.memory;
      outcome = sameMemory
        ? await this.reinforcedOutcome(ctx, sameMemory, 'reinforced', { content: atom.content })
        : { memory: await this.insert(ctx, atom), action: 'created', superseded: [], conflicts: [], supports: [] };
    }
    const memory = outcome.memory;

    // The caller's word first, then the judge's inferences for everything else.
    for (const old of forced.memories) {
      if (old.id === memory.id) continue;
      outcome.superseded.push(await this.supersede(ctx, old, memory, forced.reason, 'agent'));
    }
    if (outcome.action === 'reinforced') return outcome;

    const byRelation = (r: Verdict['relation']) =>
      verdicts.flatMap((v) => {
        const m = v.relation === r ? close.find((c) => c.memory.id === v.id)?.memory : undefined;
        return m ? [{ v, memory: m }] : [];
      });
    for (const { v, memory: old } of byRelation('updates')) {
      outcome.superseded.push(await this.supersede(ctx, old, memory, v.reason, 'judge'));
    }
    for (const { v, memory: other } of byRelation('contradicts')) {
      const link = await this.store.insertLink({
        fromId: memory.id,
        toId: other.id,
        type: 'contradicts',
        reason: v.reason,
        ownerId: ctx.ownerId,
        resolved: false,
      });
      await this.emit(ctx, 'conflict', memory.id, { linkId: link.id, a: memory.content, b: other.content, reason: v.reason });
      outcome.conflicts.push({ link, other });
    }
    await Promise.all(
      byRelation('supports').map(({ v, memory: other }) => {
        outcome.supports.push(other);
        return this.store.insertLink({ fromId: memory.id, toId: other.id, type: 'supports', reason: v.reason, ownerId: ctx.ownerId, resolved: true });
      }),
    );
    return outcome;
  }

  /** Mark `old` as replaced by `by`, keeping the history as a `supersedes` link. */
  private async supersede(ctx: Ctx, old: Memory, by: Memory, reason: string, via: 'agent' | 'judge') {
    await Promise.all([
      this.store.updateMemory(old.id, { status: 'superseded', supersededBy: by.id }),
      this.store.insertLink({ fromId: by.id, toId: old.id, type: 'supersedes', reason, ownerId: ctx.ownerId, resolved: true }),
      this.emit(ctx, 'superseded', old.id, { by: by.id, from: old.content, to: by.content, reason, via }),
    ]);
    return { memory: { ...old, status: 'superseded' as const, supersededBy: by.id }, reason, via };
  }

  private async insert(
    ctx: Ctx,
    atom: { content: string; kind: Kind; project: string; vector: number[]; excerpt: string | null },
  ): Promise<Memory> {
    const id = randomUUID();
    await this.store.putVector(id, atom.vector, { ownerId: ctx.ownerId, project: atom.project, kind: atom.kind });
    try {
      const memory = await this.store.insertMemory({
        id,
        content: atom.content,
        kind: atom.kind,
        project: atom.project,
        status: 'active',
        stability: INITIAL_STABILITY[atom.kind],
        recallCount: 0,
        lastReinforcedAt: this.now().toISOString(),
        supersededBy: null,
        sessionId: ctx.sessionId,
        agent: ctx.agent,
        excerpt: atom.excerpt,
        confidence: 1,
        ownerId: ctx.ownerId,
        createdAt: this.now().toISOString(),
      });
      await this.emit(ctx, 'remembered', id, { content: atom.content, kind: atom.kind });
      return memory;
    } catch (err) {
      await this.store.deleteVector(id);
      throw err;
    }
  }

  /** Active memories near `vector` in the same project scope, closest first. */
  private async neighbours(ownerId: string, vector: number[], project: string | undefined, limit = 8) {
    const hits = await this.store.vectorSearch(ownerId, vector, limit);
    const rows = new Map((await this.store.getMemories(hits.map((h) => h.id))).map((m) => [m.id, m]));
    return hits
      .map((h) => ({ memory: rows.get(h.id), distance: h.distance }))
      .filter((c): c is { memory: Memory; distance: number } => !!c.memory)
      .filter((c) => c.memory.ownerId === ownerId && c.memory.status === 'active')
      .filter((c) => !project || sameScope(c.memory.project, project));
  }

  private async reinforce(ctx: Ctx, memory: Memory, type: EventType, detail: Record<string, unknown>) {
    const r = this.retentionOf(memory);
    const updated = await this.store.updateMemory(memory.id, {
      stability: reinforcedStability(memory.stability, r),
      lastReinforcedAt: this.now().toISOString(),
      recallCount: memory.recallCount + 1,
    });
    await this.emit(ctx, type, memory.id, { ...detail, retentionBefore: r, stability: updated.stability });
    return updated;
  }

  private async reinforcedOutcome(ctx: Ctx, memory: Memory, type: EventType, detail: Record<string, unknown>) {
    const updated = await this.reinforce(ctx, memory, type, detail);
    return { memory: updated, action: 'reinforced' as const, superseded: [], conflicts: [], supports: [] };
  }

  // ---------------------------------------------------------------- recall

  async recall(
    ctx: Ctx,
    input: { query: string; project?: string; k?: number; includeFaded?: boolean; reinforce?: boolean },
  ): Promise<RecallHit[]> {
    const k = input.k ?? 5;
    const [vector] = await this.embedder.embed([input.query]);
    const near = await this.neighbours(ctx.ownerId, vector!, input.project ?? ctx.project, 25);
    const ranked = near
      .map((c) => {
        const r = this.retentionOf(c.memory);
        return { memory: c.memory, distance: c.distance, retention: r, score: recallScore(c.distance, r) };
      })
      .filter((h) => input.includeFaded || !isFaded(h.retention))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    const ids = ranked.map((h) => h.memory.id);
    const conflictLinks = await this.store.listLinks(ctx.ownerId, { memoryIds: ids, type: 'contradicts', resolved: false });
    const otherIds = [...new Set(conflictLinks.flatMap((l) => [l.fromId, l.toId]))];
    const others = new Map((await this.store.getMemories(otherIds)).map((m) => [m.id, m]));

    const reinforced =
      input.reinforce === false
        ? ranked.map((h) => h.memory)
        : await Promise.all(ranked.map((h) => this.reinforce(ctx, h.memory, 'recalled', { query: input.query })));

    return ranked.map((h, i) => ({
      ...h,
      memory: reinforced[i]!,
      conflictsWith: conflictLinks
        .filter((l) => l.fromId === h.memory.id || l.toId === h.memory.id)
        .map((l) => others.get(l.fromId === h.memory.id ? l.toId : l.fromId))
        .filter((m): m is Memory => !!m),
    }));
  }

  // ---------------------------------------------------------------- inspect & edit

  private async owned(ctx: Ctx, id: string): Promise<Memory> {
    const memory = await this.store.getMemory(id);
    if (!memory || memory.ownerId !== ctx.ownerId) throw new Error(`No memory with id ${id}`);
    return memory;
  }

  /** Count a direct use of a memory as a recall (strengthens it). */
  async touch(ctx: Ctx, id: string, detail: Record<string, unknown> = {}): Promise<Memory> {
    return this.reinforce(ctx, await this.owned(ctx, id), 'recalled', detail);
  }

  async forget(ctx: Ctx, id: string): Promise<Memory> {
    const memory = await this.owned(ctx, id);
    const updated = await this.store.updateMemory(id, { status: 'forgotten' });
    await this.emit(ctx, 'forgotten', id, { content: memory.content });
    return updated;
  }

  async why(ctx: Ctx, id: string): Promise<WhyResult> {
    const memory = await this.owned(ctx, id);
    // Independent reads in parallel; only the (rare) multi-step history chain is sequential.
    const [links, session, events] = await Promise.all([
      this.store.listLinks(ctx.ownerId, { memoryIds: [id] }),
      this.store.getSession(memory.sessionId),
      this.store.listEvents(ctx.ownerId, { memoryId: id, limit: 100 }),
    ]);
    const others = new Map(
      (await this.store.getMemories([...new Set(links.map((l) => (l.fromId === id ? l.toId : l.fromId)))])).map((m) => [m.id, m]),
    );

    const replaced: Memory[] = [];
    let olderLinks = links.filter((l) => l.type === 'supersedes' && l.fromId === id);
    for (let depth = 0; olderLinks.length && depth < 10; depth++) {
      const older = others.get(olderLinks[0]!.toId) ?? (await this.store.getMemory(olderLinks[0]!.toId));
      if (!older) break;
      replaced.push(older);
      olderLinks = (await this.store.listLinks(ctx.ownerId, { memoryIds: [older.id], type: 'supersedes' })).filter(
        (l) => l.fromId === older.id,
      );
    }

    const replacedBy: Memory[] = [];
    let next = memory.supersededBy;
    for (let depth = 0; next && depth < 10; depth++) {
      const newer = others.get(next) ?? (await this.store.getMemory(next));
      if (!newer) break;
      replacedBy.push(newer);
      next = newer.supersededBy;
    }

    return {
      memory,
      retention: this.retentionOf(memory),
      session,
      replaced,
      replacedBy,
      links: links.flatMap((link) => {
        const other = others.get(link.fromId === id ? link.toId : link.fromId);
        return other ? [{ link, other }] : [];
      }),
      events,
    };
  }

  async conflicts(ctx: Ctx, project?: string): Promise<Conflict[]> {
    const links = await this.store.listLinks(ctx.ownerId, { type: 'contradicts', resolved: false });
    const mems = new Map((await this.store.getMemories([...new Set(links.flatMap((l) => [l.fromId, l.toId]))])).map((m) => [m.id, m]));
    return links.flatMap((link) => {
      const a = mems.get(link.fromId);
      const b = mems.get(link.toId);
      if (!a || !b || a.status !== 'active' || b.status !== 'active') return [];
      if (project && !sameScope(a.project, project)) return [];
      return [{ link, a, b }];
    });
  }

  async resolve(ctx: Ctx, linkId: string, keepId: string): Promise<{ kept: Memory; dropped: Memory }> {
    const link = await this.store.getLink(linkId);
    if (!link || link.ownerId !== ctx.ownerId || link.type !== 'contradicts') throw new Error(`No conflict with id ${linkId}`);
    if (keepId !== link.fromId && keepId !== link.toId) throw new Error('keepMemoryId must be one side of the conflict');
    const dropId = keepId === link.fromId ? link.toId : link.fromId;
    const kept = await this.owned(ctx, keepId);
    const dropped = await this.store.updateMemory(dropId, { status: 'superseded', supersededBy: keepId });
    await this.store.updateLink(linkId, { resolved: true });
    await this.store.insertLink({
      fromId: keepId,
      toId: dropId,
      type: 'supersedes',
      reason: 'Resolved by the user.',
      ownerId: ctx.ownerId,
      resolved: true,
    });
    await this.emit(ctx, 'resolved', keepId, { linkId, kept: kept.content, dropped: dropped.content });
    return { kept: await this.reinforce(ctx, kept, 'reinforced', { via: 'resolve' }), dropped };
  }

  async timeline(ctx: Ctx, opts: { project?: string; limit?: number } = {}): Promise<MemoryEvent[]> {
    return this.store.listEvents(ctx.ownerId, opts);
  }

  async graph(ctx: Ctx, project?: string): Promise<Graph> {
    const memories = (await this.store.listMemories(ctx.ownerId, { project })).filter((m) => m.status !== 'forgotten');
    const ids = new Set(memories.map((m) => m.id));
    const links = (await this.store.listLinks(ctx.ownerId)).filter((l) => ids.has(l.fromId) && ids.has(l.toId));
    const now = this.now();
    return { memories: memories.map((m) => ({ ...m, retention: this.retentionOf(m, now) })), links };
  }

  async stats(ctx: Ctx, project?: string) {
    const { memories } = await this.graph(ctx, project);
    const active = memories.filter((m) => m.status === 'active');
    return {
      total: memories.length,
      active: active.length,
      superseded: memories.length - active.length,
      faded: active.filter((m) => isFaded(m.retention)).length,
      openConflicts: (await this.conflicts(ctx, project)).length,
      avgRetention: active.length ? active.reduce((s, m) => s + m.retention, 0) / active.length : 0,
    };
  }

  /** Mark the session as alive. Emits a `session` event the first time. */
  async heartbeat(ctx: Ctx, first = false): Promise<void> {
    await this.store.upsertSession({
      id: ctx.sessionId,
      agent: ctx.agent,
      project: ctx.project,
      lastSeenAt: this.now().toISOString(),
      ownerId: ctx.ownerId,
    });
    if (first) await this.emit(ctx, 'session', null, { started: true });
  }

  private emit(ctx: Ctx, type: EventType, memoryId: string | null, detail: Record<string, unknown>) {
    return this.store.insertEvent({
      type,
      memoryId,
      sessionId: ctx.sessionId,
      agent: ctx.agent,
      project: ctx.project,
      detail,
      ownerId: ctx.ownerId,
      createdAt: this.now().toISOString(),
    });
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * (b[i] ?? 0);
    na += a[i]! * a[i]!;
    nb += (b[i] ?? 0) * (b[i] ?? 0);
  }
  return na && nb ? 1 - dot / Math.sqrt(na * nb) : 1;
}

function summarize(outcomes: RememberOutcome[], skipped: { id: string; why: string }[], agent: string): string {
  const created = outcomes.filter((o) => o.action === 'created');
  const reinforced = outcomes.filter((o) => o.action === 'reinforced');
  const lines: string[] = [];
  if (created.length) lines.push(`Stored ${created.length} new ${created.length === 1 ? 'memory' : 'memories'}:`);
  for (const o of created) lines.push(`  + ${quote(o.memory.content)} [${o.memory.kind}] (id ${o.memory.id})`);
  for (const o of reinforced) lines.push(`Already knew ${quote(o.memory.content)}, strengthened it.`);
  for (const o of outcomes) {
    for (const s of o.superseded) {
      const by = s.via === 'agent' ? `replaced as ${agent} reported` : 'Déjà detected a change';
      lines.push(`Superseded ${quote(s.memory.content)} → ${quote(o.memory.content)} (${by}: ${s.reason})`);
    }
    for (const c of o.conflicts) {
      lines.push(
        `⚠ Conflict: ${quote(o.memory.content)} vs ${quote(c.other.content)}. Ask the user which is right, then call resolve_conflict with linkId ${c.link.id}.`,
      );
    }
  }
  for (const s of skipped) lines.push(`Couldn't replace memory ${s.id}: ${s.why}.`);
  return lines.join('\n');
}
