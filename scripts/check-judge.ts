// Does the Claude judge make the right calls? `pnpm check:judge`. Read-only: no memories are written.
// Uses real Appwrite embeddings for distances, then asks ClaudeJudge to relate and extract.
import { AppwriteEmbedder, ClaudeJudge, cosineDistance, loadConfig, serverClient, type Relation } from '@deja/core';

const config = loadConfig();
if (!config.anthropicKey) {
  console.log('✗ ANTHROPIC_API_KEY is empty in .env. Add it, then rerun `pnpm check:judge`.');
  process.exit(1);
}
const judge = new ClaudeJudge(config.anthropicKey, config.model);
const embedder = new AppwriteEmbedder(serverClient(config));

const CASES: { incoming: string; existing: string; expect: Relation[] }[] = [
  { incoming: 'We moved error tracking from Sentry to Highlight', existing: 'Errors are tracked in Sentry with source maps uploaded on deploy', expect: ['updates'] },
  { incoming: 'Yash now prefers spaces instead of tabs', existing: 'Yash prefers tabs over spaces', expect: ['updates'] },
  { incoming: 'The team migrated the app database from Postgres to MySQL on Appwrite', existing: 'The app database is Postgres hosted on Supabase', expect: ['updates'] },
  { incoming: 'Production deploys are frozen on Fridays to protect weekend traffic', existing: 'Production deploys happen on Fridays after the weekly demo', expect: ['contradicts', 'updates'] },
  { incoming: 'Yash likes PRs to stay under 300 lines', existing: 'Yash prefers small pull requests under 300 lines', expect: ['same'] },
  { incoming: 'Priya owns the payments service and reviews Stripe changes', existing: 'Payments go through Stripe Checkout', expect: ['supports', 'unrelated'] },
  { incoming: 'Feature flags are managed in PostHog', existing: 'The app database is Postgres hosted on Supabase', expect: ['unrelated'] },
];

console.log(`Judge: ${config.model}\n`);
const texts = CASES.flatMap((c) => [c.incoming, c.existing]);
const vecs = await embedder.embed(texts);
let failures = 0;
for (const [i, c] of CASES.entries()) {
  const distance = cosineDistance(vecs[i * 2]!, vecs[i * 2 + 1]!);
  const t0 = Date.now();
  const [v] = await judge.relate(c.incoming, [{ id: 'm1', content: c.existing, createdAt: '2026-09-01T00:00:00Z', distance }]);
  const ok = !!v && c.expect.includes(v.relation);
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${v?.relation.padEnd(11)} d=${distance.toFixed(3)} ${Date.now() - t0}ms · "${c.incoming}" vs "${c.existing}"`);
  console.log(`    ${v?.reason} (confidence ${v?.confidence})`);
}

const story =
  "Quick context: we finally moved off Supabase, everything's on Appwrite MySQL now. Also Marco is covering payments while Priya is out, and please never force-push to main. Anyway, can you fix the typo in the footer?";
const t0 = Date.now();
const atoms = await judge.extract(story);
console.log(`\nextract (${Date.now() - t0}ms) → ${atoms.length} memories:`);
for (const a of atoms) console.log(`  [${a.kind}] ${a.content}`);
const extractOk = atoms.length >= 3 && atoms.length <= 4 && !atoms.some((a) => /typo|footer/i.test(a.content));
if (!extractOk) failures++;
console.log(`${extractOk ? '✓' : '✗'} durable facts kept, transient request (footer typo) dropped`);

console.log(`\n${failures ? `${failures} check(s) failed` : 'Claude judge OK'}`);
process.exitCode = failures ? 1 : 0;
