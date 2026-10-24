import { describe, expect, it } from 'vitest';
import { Deja } from '../src/engine.ts';
import { HeuristicJudge, type Candidate, type Judge, type Thresholds, type Verdict } from '../src/judge.ts';
import { HashEmbedder, MemoryStore } from '../src/memory-store.ts';
import type { Ctx } from '../src/types.ts';

// The hash embedder is far less semantic than nomic-embed-text, so widen the cutoffs.
const LOOSE: Thresholds = { duplicate: 0.06, candidate: 0.6, update: 0.5, related: 0.3 };

const ctx: Ctx = { ownerId: 'u1', sessionId: 's1', agent: 'test-agent', project: 'shop' };

function setup(judge: Judge = new HeuristicJudge(LOOSE)) {
  let t = new Date('2026-10-24T10:00:00Z');
  const clock = { now: () => t, advanceDays: (n: number) => (t = new Date(t.getTime() + n * 86_400_000)) };
  const store = new MemoryStore(clock.now);
  const deja = new Deja({ store, embedder: new HashEmbedder(), judge, now: clock.now, thresholds: LOOSE });
  return { deja, store, clock };
}

/** Judge that answers from a lookup table keyed by candidate content. */
class ScriptedJudge extends HeuristicJudge {
  constructor(private script: Record<string, Verdict['relation']>) {
    super(LOOSE);
  }
  override async relate(incoming: string, candidates: Candidate[]): Promise<Verdict[]> {
    return candidates.map((c) => ({
      id: c.id,
      relation: this.script[c.content] ?? 'unrelated',
      reason: 'scripted',
      confidence: 1,
    }));
  }
}

describe('remember', () => {
  it('stores a new memory with provenance and emits an event', async () => {
    const { deja, store } = setup();
    const res = await deja.remember(ctx, { content: 'The team uses pnpm for package management' });
    expect(res.outcomes).toHaveLength(1);
    const m = res.outcomes[0]!.memory;
    expect(m).toMatchObject({ status: 'active', agent: 'test-agent', sessionId: 's1', project: 'shop', kind: 'convention' });
    const events = await store.listEvents('u1');
    expect(events.map((e) => e.type)).toEqual(['remembered']);
  });

  it('reinforces instead of duplicating identical memories', async () => {
    const { deja, store } = setup();
    await deja.remember(ctx, { content: 'The team uses pnpm for package management' });
    const again = await deja.remember(ctx, { content: 'The team uses pnpm for package management' });
    expect(again.outcomes[0]!.action).toBe('reinforced');
    expect(await store.listMemories('u1')).toHaveLength(1);
    expect((await store.listMemories('u1'))[0]!.recallCount).toBe(1);
  });

  it('supersedes a memory the judge says was updated, and keeps the chain', async () => {
    const old = 'The app database is Postgres';
    const { deja } = setup(new ScriptedJudge({ [old]: 'updates' }));
    const first = await deja.remember(ctx, { content: old });
    const second = await deja.remember(ctx, { content: 'The app database moved from Postgres to MySQL' });

    const oldId = first.outcomes[0]!.memory.id;
    const newMem = second.outcomes[0]!.memory;
    expect(second.outcomes[0]!.superseded.map((s) => s.memory.id)).toEqual([oldId]);
    expect(second.summary).toContain('Superseded');

    const why = await deja.why(ctx, newMem.id);
    expect(why.replaced.map((m) => m.content)).toEqual([old]);
    const whyOld = await deja.why(ctx, oldId);
    expect(whyOld.memory.status).toBe('superseded');
    expect(whyOld.replacedBy.map((m) => m.id)).toEqual([newMem.id]);
  });

  it('records ambiguous contradictions as open conflicts that can be resolved', async () => {
    const a = 'Deploys happen on Fridays';
    const { deja } = setup(new ScriptedJudge({ [a]: 'contradicts' }));
    const first = await deja.remember(ctx, { content: a });
    const second = await deja.remember(ctx, { content: 'Deploys never happen on Fridays' });
    expect(second.summary).toContain('Conflict');

    const open = await deja.conflicts(ctx);
    expect(open).toHaveLength(1);

    const keep = second.outcomes[0]!.memory.id;
    const { dropped } = await deja.resolve(ctx, open[0]!.link.id, keep);
    expect(dropped.id).toBe(first.outcomes[0]!.memory.id);
    expect(dropped.status).toBe('superseded');
    expect(await deja.conflicts(ctx)).toHaveLength(0);
  });

  it('heuristic judge supersedes on change language without an API key', async () => {
    const { deja } = setup();
    await deja.remember(ctx, { content: 'We deploy the web app to Vercel' });
    const res = await deja.remember(ctx, { content: 'We migrated the web app deploy from Vercel to Appwrite Sites' });
    expect(res.outcomes[0]!.superseded).toHaveLength(1);
  });
});

describe('recall', () => {
  it('finds relevant memories, reinforces them, and warns about conflicts', async () => {
    const a = 'Deploys happen on Fridays';
    const { deja, store } = setup(new ScriptedJudge({ [a]: 'contradicts' }));
    await deja.remember(ctx, { content: a });
    await deja.remember(ctx, { content: 'Deploys never happen on Fridays' });
    await deja.remember(ctx, { content: 'Yash prefers dark mode in every tool' });

    const hits = await deja.recall(ctx, { query: 'when do deploys happen', k: 2 });
    expect(hits).toHaveLength(2);
    expect(hits.every((h) => h.memory.content.includes('Deploys'))).toBe(true);
    expect(hits[0]!.conflictsWith).toHaveLength(1);
    expect(hits[0]!.memory.recallCount).toBe(1);
    const recalled = (await store.listEvents('u1')).filter((e) => e.type === 'recalled');
    expect(recalled).toHaveLength(2);
  });

  it('hides faded memories but lets recalled ones survive', async () => {
    const { deja, clock } = setup();
    await deja.remember(ctx, { content: 'The staging server was rebooted yesterday', kind: 'event' });
    await deja.remember(ctx, { content: 'Yash prefers tabs over spaces', kind: 'preference' });
    clock.advanceDays(30);
    const hits = await deja.recall(ctx, { query: 'staging server rebooted', k: 5 });
    expect(hits.find((h) => h.memory.kind === 'event')).toBeUndefined();
    const faded = await deja.recall(ctx, { query: 'staging server rebooted', k: 5, includeFaded: true });
    expect(faded.find((h) => h.memory.kind === 'event')).toBeDefined();
  });

  it('does not leak memories across owners or projects', async () => {
    const { deja } = setup();
    await deja.remember(ctx, { content: 'The shop uses Stripe for payments' });
    await deja.remember({ ...ctx, ownerId: 'u2' }, { content: 'The shop uses Stripe for payments' });
    await deja.remember({ ...ctx, project: 'blog' }, { content: 'The blog uses Stripe for payments' });
    const hits = await deja.recall(ctx, { query: 'payments Stripe' });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.memory.project).toBe('shop');
  });
});

describe('graph + stats', () => {
  it('summarises the brain', async () => {
    const old = 'The app database is Postgres';
    const { deja } = setup(new ScriptedJudge({ [old]: 'updates' }));
    await deja.remember(ctx, { content: old });
    await deja.remember(ctx, { content: 'The app database moved from Postgres to MySQL' });
    const stats = await deja.stats(ctx);
    expect(stats).toMatchObject({ total: 2, active: 1, superseded: 1, openConflicts: 0 });
    const graph = await deja.graph(ctx);
    expect(graph.links.map((l) => l.type)).toEqual(['supersedes']);
  });
});
