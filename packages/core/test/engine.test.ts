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

describe('demo story', () => {
  it('seeds a brain with supersedes, one open conflict, and reinforced memories', async () => {
    const { seedDemo } = await import('../src/demo.ts');
    const store = new MemoryStore(() => new Date());
    await seedDemo({ store, embedder: new HashEmbedder(), ownerId: 'demo' });
    const deja = new Deja({ store, embedder: new HashEmbedder(), judge: new HeuristicJudge(LOOSE) });
    const c: Ctx = { ...ctx, ownerId: 'demo', project: 'acme-shop' };
    const stats = await deja.stats(c);
    expect(stats.superseded).toBe(2);
    expect(stats.openConflicts).toBe(1);
    const all = await store.listMemories('demo');
    expect(all.find((m) => m.content.startsWith('The team uses pnpm'))!.recallCount).toBe(9);
  });
});

describe('agent-reported supersedes (replaces)', () => {
  it('supersedes what the agent names even when the judge sees no link', async () => {
    const { deja } = setup();
    const old = await deja.remember(ctx, { content: 'The team runs scripts with Node 20' });
    // No change words and little lexical overlap: the heuristic judge alone would not connect these.
    const res = await deja.remember(ctx, {
      content: 'Bun is the runtime for everything these days',
      replaces: [old.outcomes[0]!.memory.id],
      reason: 'The team switched runtimes.',
    });
    const o = res.outcomes[0]!;
    expect(o.action).toBe('created');
    expect(o.superseded).toHaveLength(1);
    expect(o.superseded[0]).toMatchObject({ via: 'agent', reason: 'The team switched runtimes.' });
    expect(res.summary).toContain('replaced as test-agent reported');
    const why = await deja.why(ctx, o.memory.id);
    expect(why.replaced.map((m) => m.content)).toEqual(['The team runs scripts with Node 20']);
  });

  it('does not let the replaced memory count as a duplicate of the new one', async () => {
    const { deja, store } = setup();
    const old = await deja.remember(ctx, { content: 'Yash prefers tabs over spaces' });
    // Near-identical vectors, opposite meaning. The agent knows better than the distance.
    const res = await deja.remember(ctx, { content: 'Yash prefers spaces over tabs', replaces: [old.outcomes[0]!.memory.id] });
    expect(res.outcomes[0]!.action).toBe('created');
    expect((await store.getMemory(old.outcomes[0]!.memory.id))!.status).toBe('superseded');
  });

  it('reports ids it cannot replace instead of failing', async () => {
    const { deja } = setup();
    const theirs = await deja.remember({ ...ctx, ownerId: 'someone-else' }, { content: 'Their private fact' });
    const mine = await deja.remember(ctx, { content: 'Deploys go out on Tuesdays' });
    await deja.forget(ctx, mine.outcomes[0]!.memory.id);
    const res = await deja.remember(ctx, {
      content: 'Deploys go out on Thursdays now',
      replaces: ['does-not-exist', theirs.outcomes[0]!.memory.id, mine.outcomes[0]!.memory.id],
    });
    expect(res.outcomes[0]!.superseded).toHaveLength(0);
    expect(res.skipped.map((s) => s.why)).toEqual(['no such memory', 'no such memory', 'already forgotten']);
    expect(res.summary).toContain("Couldn't replace memory does-not-exist");
  });

  it('supersedes onto the existing memory when the new content is already known', async () => {
    const { deja, store } = setup();
    const a = await deja.remember(ctx, { content: 'Staging lives on Fly.io' });
    const b = await deja.remember(ctx, { content: 'Staging runs on Appwrite Sites', kind: 'fact' });
    const res = await deja.remember(ctx, { content: 'Staging runs on Appwrite Sites', replaces: [a.outcomes[0]!.memory.id] });
    expect(res.outcomes[0]!.action).toBe('reinforced');
    expect(res.outcomes[0]!.memory.id).toBe(b.outcomes[0]!.memory.id);
    expect((await store.getMemory(a.outcomes[0]!.memory.id))!.supersededBy).toBe(b.outcomes[0]!.memory.id);
  });

  it('never double-supersedes when the judge also infers the update', async () => {
    const old = 'The app database is Postgres';
    const { deja, store } = setup(new ScriptedJudge({ [old]: 'updates' }));
    const first = await deja.remember(ctx, { content: old });
    const res = await deja.remember(ctx, { content: 'The app database moved from Postgres to MySQL', replaces: [first.outcomes[0]!.memory.id] });
    expect(res.outcomes[0]!.superseded).toHaveLength(1);
    const links = await store.listLinks('u1', { type: 'supersedes' });
    expect(links).toHaveLength(1);
  });
});
