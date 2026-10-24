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
  superseded: { memory: Memory; reason: string }[];
  conflicts: { link: Link; other: Memory }[];
  supports: Memory[];
}

export interface RememberResult {
  outcomes: RememberOutcome[];
  summary: string;
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

  async remember(
    ctx: Ctx,
    input: { content: string; project?: string; kind?: Kind; excerpt?: string },
  ): Promise<RememberResult> {
    const project = input.project ?? ctx.project;
    const atoms = await this.judge.extract(input.content, input.kind);
    if (atoms.length === 0) return { outcomes: [], summary: 'Nothing durable to remember.' };

    const vectors = await this.embedder.embed(atoms.map((a) => a.content));
    const outcomes: RememberOutcome[] = [];
    for (const [i, atom] of atoms.entries()) {
      outcomes.push(
        await this.rememberAtom(ctx, {
          ...atom,
          project,
          vector: vectors[i]!,
          excerpt: input.excerpt ?? (atoms.length > 1 || atom.content !== input.content ? input.content : null),
        }),
      );
    }
    return { outcomes, summary: summarize(outcomes) };
  }

  private async rememberAtom(
    ctx: Ctx,
    atom: { content: string; kind: Kind; project: string; vector: number[]; excerpt: string | null },
  ): Promise<RememberOutcome> {
    const candidates = await this.neighbours(ctx.ownerId, atom.vector, atom.project);
    const close = candidates.filter((c) => c.distance < this.t.candidate);

    const best = close[0];
    if (best && best.distance < this.t.duplicate) {
      return this.reinforcedOutcome(ctx, best.memory, 'reinforced', { content: atom.content });
    }

    const verdicts: Verdict[] = await this.judge.relate(
      atom.content,
      close.map<Candidate>((c) => ({
        id: c.memory.id,
        content: c.memory.content,
        createdAt: c.memory.createdAt,
        distance: c.distance,
      })),
    );
    const byRelation = (r: Verdict['relation']) =>
      verdicts.filter((v) => v.relation === r).map((v) => ({ v, memory: close.find((c) => c.memory.id === v.id)!.memory }));

    const same = byRelation('same')[0];
    if (same) return this.reinforcedOutcome(ctx, same.memory, 'reinforced', { content: atom.content });

    const memory = await this.insert(ctx, atom);
    const outcome: RememberOutcome = { memory, action: 'created', superseded: [], conflicts: [], supports: [] };

    for (const { v, memory: old } of byRelation('updates')) {
      await this.store.updateMemory(old.id, { status: 'superseded', supersededBy: memory.id });
      await this.store.insertLink({
        fromId: memory.id,
        toId: old.id,
        type: 'supersedes',
        reason: v.reason,
        ownerId: ctx.ownerId,
        resolved: true,
      });
      await this.emit(ctx, 'superseded', old.id, { by: memory.id, from: old.content, to: memory.content, reason: v.reason });
      outcome.superseded.push({ memory: { ...old, status: 'superseded', supersededBy: memory.id }, reason: v.reason });
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
    for (const { v, memory: other } of byRelation('supports')) {
      await this.store.insertLink({
        fromId: memory.id,
        toId: other.id,
        type: 'supports',
        reason: v.reason,
        ownerId: ctx.ownerId,
        resolved: true,
      });
      outcome.supports.push(other);
    }
    return outcome;
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
    const links = await this.store.listLinks(ctx.ownerId, { memoryIds: [id] });
    const others = new Map(
      (await this.store.getMemories([...new Set(links.map((l) => (l.fromId === id ? l.toId : l.fromId)))])).map((m) => [m.id, m]),
    );

    const replaced: Memory[] = [];
    let cursor: string | undefined = id;
    for (let depth = 0; cursor && depth < 10; depth++) {
      const [prev] = await this.store.listLinks(ctx.ownerId, { memoryIds: [cursor], type: 'supersedes' }).then((ls) =>
        ls.filter((l) => l.fromId === cursor),
      );
      if (!prev) break;
      const older = await this.store.getMemory(prev.toId);
      if (!older) break;
      replaced.push(older);
      cursor = older.id;
    }

    const replacedBy: Memory[] = [];
    let next = memory.supersededBy;
    for (let depth = 0; next && depth < 10; depth++) {
      const newer = await this.store.getMemory(next);
      if (!newer) break;
      replacedBy.push(newer);
      next = newer.supersededBy;
    }

    const events = (await this.store.listEvents(ctx.ownerId, { limit: 200 })).filter((e) => e.memoryId === id);
    return {
      memory,
      retention: this.retentionOf(memory),
      session: await this.store.getSession(memory.sessionId),
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

function summarize(outcomes: RememberOutcome[]): string {
  const created = outcomes.filter((o) => o.action === 'created');
  const reinforced = outcomes.filter((o) => o.action === 'reinforced');
  const lines: string[] = [];
  if (created.length) lines.push(`Stored ${created.length} new ${created.length === 1 ? 'memory' : 'memories'}:`);
  for (const o of created) lines.push(`  + ${quote(o.memory.content)} [${o.memory.kind}] (id ${o.memory.id})`);
  for (const o of reinforced) lines.push(`Already knew ${quote(o.memory.content)}, strengthened it.`);
  for (const o of outcomes) {
    for (const s of o.superseded) lines.push(`Superseded ${quote(s.memory.content)} → ${quote(o.memory.content)} (${s.reason})`);
    for (const c of o.conflicts) {
      lines.push(
        `⚠ Conflict: ${quote(o.memory.content)} vs ${quote(c.other.content)}. Ask the user which is right, then call resolve_conflict with linkId ${c.link.id}.`,
      );
    }
  }
  return lines.join('\n');
}
