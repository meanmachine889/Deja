// The demo brain: two months of an agent working on a fictional storefront. Shared by the offline
// dashboard and scripts/seed-demo.ts so the video always starts from the same sky.
import { Deja } from './engine.ts';
import { HeuristicJudge, type Candidate, type Verdict } from './judge.ts';
import type { Embedder, Store } from './store.ts';
import type { Ctx, Kind } from './types.ts';

export const DEMO_PROJECT = 'acme-shop';

interface Beat {
  daysAgo: number;
  agent: string;
  content: string;
  kind: Kind;
  project?: string;
  /** Content of an earlier beat this one replaces. */
  replaces?: string;
  /** Content of an earlier beat this one conflicts with. */
  contradicts?: string;
  supports?: string;
  /** Times an agent recalled it afterwards (spread over the remaining days). */
  recalls?: number;
}

export const DEMO_STORY: Beat[] = [
  { daysAgo: 62, agent: 'claude-code', kind: 'fact', content: 'The storefront is a Next.js app in apps/web', recalls: 6 },
  { daysAgo: 62, agent: 'claude-code', kind: 'convention', content: 'The team uses pnpm workspaces for every package', recalls: 9 },
  { daysAgo: 60, agent: 'claude-code', kind: 'fact', content: 'The app database is Postgres hosted on Supabase' },
  { daysAgo: 58, agent: 'claude-code', kind: 'preference', content: 'Yash prefers small pull requests under 300 lines', project: 'global', recalls: 7 },
  { daysAgo: 55, agent: 'cursor', kind: 'convention', content: 'API routes live in apps/api and are written with Hono', recalls: 3 },
  { daysAgo: 50, agent: 'claude-code', kind: 'fact', content: 'Payments go through Stripe Checkout', recalls: 2 },
  { daysAgo: 47, agent: 'cursor', kind: 'person', content: 'Priya owns the payments service and reviews Stripe changes', supports: 'Payments go through Stripe Checkout', recalls: 2 },
  { daysAgo: 44, agent: 'claude-code', kind: 'convention', content: 'Unit tests use Vitest and end-to-end tests use Playwright', recalls: 4 },
  { daysAgo: 40, agent: 'claude-code', kind: 'fact', content: 'The storefront is deployed to Vercel' },
  { daysAgo: 38, agent: 'claude-code', kind: 'event', content: 'The staging server was rebooted after a memory leak in the image worker' },
  { daysAgo: 35, agent: 'cursor', kind: 'convention', content: 'Styling uses Tailwind v4 design tokens and never inline hex colors', recalls: 5 },
  { daysAgo: 33, agent: 'claude-code', kind: 'preference', content: 'Yash writes TypeScript with strict mode on everywhere', project: 'global', recalls: 4 },
  {
    daysAgo: 30,
    agent: 'claude-code',
    kind: 'decision',
    content: 'The team migrated the app database from Postgres to MySQL on Appwrite',
    replaces: 'The app database is Postgres hosted on Supabase',
    recalls: 5,
  },
  { daysAgo: 27, agent: 'codex', kind: 'fact', content: 'Feature flags are managed in PostHog', recalls: 1 },
  { daysAgo: 24, agent: 'claude-code', kind: 'event', content: 'Black Friday load test peaked at 2,400 requests per second' },
  { daysAgo: 21, agent: 'cursor', kind: 'preference', content: 'Yash wants dark-mode screenshots in every UI pull request', project: 'global', recalls: 2 },
  { daysAgo: 18, agent: 'claude-code', kind: 'decision', content: 'Production deploys happen on Fridays after the weekly demo', recalls: 1 },
  {
    daysAgo: 15,
    agent: 'claude-code',
    kind: 'decision',
    content: 'Storefront hosting moved from Vercel to Appwrite Sites',
    replaces: 'The storefront is deployed to Vercel',
    recalls: 3,
  },
  { daysAgo: 12, agent: 'codex', kind: 'convention', content: 'All API input is validated with Zod schemas', supports: 'API routes live in apps/api and are written with Hono', recalls: 3 },
  { daysAgo: 9, agent: 'claude-code', kind: 'event', content: 'Checkout conversion dropped 4% after the cart redesign' },
  {
    daysAgo: 6,
    agent: 'cursor',
    kind: 'decision',
    content: 'Production deploys are frozen on Fridays to protect weekend traffic',
    contradicts: 'Production deploys happen on Fridays after the weekly demo',
  },
  { daysAgo: 4, agent: 'claude-code', kind: 'fact', content: 'Errors are tracked in Sentry with source maps uploaded on deploy', recalls: 1 },
  { daysAgo: 3, agent: 'codex', kind: 'person', content: 'Priya is on leave until mid-November; Marco covers payments', recalls: 1 },
  { daysAgo: 2, agent: 'claude-code', kind: 'event', content: 'The image worker memory leak was fixed by streaming uploads' },
  { daysAgo: 1, agent: 'claude-code', kind: 'convention', content: 'Database migrations are written with Drizzle and reviewed by two people', recalls: 1 },
];

/** Judge that follows the story's hints, so seeding is deterministic with any embedder. */
class StoryJudge extends HeuristicJudge {
  override readonly name: string = 'story';
  override async relate(incoming: string, candidates: Candidate[]): Promise<Verdict[]> {
    const beat = DEMO_STORY.find((b) => b.content === incoming);
    return candidates.map((c) => {
      const relation: Verdict['relation'] =
        beat?.replaces === c.content
          ? 'updates'
          : beat?.contradicts === c.content
            ? 'contradicts'
            : beat?.supports === c.content
              ? 'supports'
              : 'unrelated';
      const reason =
        relation === 'updates'
          ? 'The newer memory describes a change that replaces this one.'
          : relation === 'contradicts'
            ? 'Both describe Friday deploys but disagree, with no sign of which is newer policy.'
            : relation === 'supports'
              ? 'Adds detail to the same topic.'
              : '';
      return { id: c.id, relation, reason, confidence: 0.9 };
    });
  }
}

export async function seedDemo(opts: {
  store: Store;
  embedder: Embedder;
  ownerId: string;
  now?: Date;
  log?: (line: string) => void;
}): Promise<void> {
  const end = opts.now ?? new Date();
  let t = end;
  const deja = new Deja({
    store: opts.store,
    embedder: opts.embedder,
    judge: new StoryJudge(),
    now: () => t,
    // Never dedupe during seeding and send every neighbour to the story judge.
    thresholds: { duplicate: 0, candidate: 2, update: 0, related: 0 },
  });
  const at = (daysAgo: number) => new Date(end.getTime() - daysAgo * 86_400_000);
  const ctxFor = (b: Beat): Ctx => ({
    ownerId: opts.ownerId,
    sessionId: `demo-${b.agent}-${Math.floor(b.daysAgo / 7)}`,
    agent: b.agent,
    project: b.project ?? DEMO_PROJECT,
  });

  const recalls: { at: number; beat: Beat }[] = [];
  for (const beat of DEMO_STORY) {
    t = at(beat.daysAgo);
    const ctx = ctxFor(beat);
    await deja.heartbeat(ctx);
    await deja.remember(ctx, { content: beat.content, kind: beat.kind, project: ctx.project });
    opts.log?.(`  ${beat.daysAgo}d ago · ${beat.agent} · ${beat.content}`);
    for (let i = 1; i <= (beat.recalls ?? 0); i++) {
      recalls.push({ at: beat.daysAgo - (beat.daysAgo * i) / ((beat.recalls ?? 0) + 1), beat });
    }
  }

  // Replay recalls in time order so reinforcement follows the forgetting curve realistically.
  recalls.sort((a, b) => b.at - a.at);
  for (const r of recalls) {
    t = at(r.at);
    const ctx = ctxFor(r.beat);
    const [memory] = (await opts.store.listMemories(opts.ownerId, { project: ctx.project, limit: 500 })).filter(
      (m) => m.content === r.beat.content && m.status === 'active',
    );
    if (memory) await deja.touch(ctx, memory.id, { query: r.beat.content });
  }
}
