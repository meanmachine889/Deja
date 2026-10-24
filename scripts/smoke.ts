// Live end-to-end check against the real Appwrite project + vector index: `pnpm smoke`.
// Runs a short memory story under a throwaway owner, asserts the outcomes, then deletes its data.
import { Query, TablesDB } from 'node-appwrite';
import { createDeja, loadConfig, serverClient, T, TABLES_DB_ID, type Ctx } from '@deja/core';

const config = loadConfig();
const deja = createDeja(config);
const ownerId = `smoke${Date.now().toString(36)}`;
const ctx: Ctx = { ownerId, sessionId: `smoke-${ownerId}`, agent: 'smoke-test', project: 'smoke' };
let failures = 0;

function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` · ${detail}` : ''}`);
  if (!ok) failures++;
}

console.log(`Smoke test · project ${config.projectId} · vectors ${config.vectorBackend} · judge ${deja.judge.name}\n`);
const t0 = Date.now();
try {
  await deja.heartbeat(ctx, true);
  const a = await deja.remember(ctx, { content: 'The app database is Postgres hosted on Supabase' });
  await deja.remember(ctx, { content: 'Yash prefers small pull requests under 300 lines' });
  await deja.remember(ctx, { content: 'Errors are tracked in Sentry with source maps uploaded on deploy' });
  check('remember stores new memories', a.outcomes[0]?.action === 'created');

  const again = await deja.remember(ctx, { content: 'The app database is Postgres hosted on Supabase' });
  check('identical memory is reinforced, not duplicated', again.outcomes[0]?.action === 'reinforced');

  const b = await deja.remember(ctx, { content: 'The team migrated the app database from Postgres to MySQL on Appwrite' });
  const superseded = b.outcomes[0]?.superseded ?? [];
  check('migration supersedes the old fact', superseded.some((s) => s.memory.id === a.outcomes[0]?.memory.id), b.summary.split('\n').at(-1));

  const hits = await deja.recall(ctx, { query: 'which database do we use' });
  check('recall ranks the current database first', /MySQL/.test(hits[0]?.memory.content ?? ''), hits[0] && `${hits[0].memory.content} (d=${hits[0].distance.toFixed(3)})`);
  check('recall hides the superseded memory', !hits.some((h) => /Supabase/.test(h.memory.content) && h.memory.status !== 'active'));

  const why = await deja.why(ctx, b.outcomes[0]!.memory.id);
  check('why returns the replaced memory', why.replaced.some((m) => /Supabase/.test(m.content)));

  const node = await deja.remember(ctx, { content: 'The team runs scripts with Node 20' });
  const bun = await deja.remember(ctx, {
    content: 'Bun is the runtime for everything these days',
    replaces: [node.outcomes[0]!.memory.id],
    reason: 'The team switched runtimes.',
  });
  check(
    'agent-reported replaces supersedes without the judge',
    bun.outcomes[0]?.superseded.some((s) => s.via === 'agent' && s.memory.id === node.outcomes[0]?.memory.id) === true,
    bun.summary.split('\n').at(-1),
  );

  const stats = await deja.stats(ctx);
  check('stats', stats.active === 4 && stats.superseded === 2, JSON.stringify(stats));

  const events = await deja.timeline(ctx, { limit: 50 });
  check('events were logged for Realtime', events.length >= 8, `${events.length} events`);
} catch (err) {
  console.error('✗ threw:', err);
  failures++;
} finally {
  // Clean up the throwaway owner's rows and vectors.
  const tables = new TablesDB(serverClient(config));
  for (const tableId of Object.values(T)) {
    await tables.deleteRows({ databaseId: TABLES_DB_ID, tableId, queries: [Query.equal('ownerId', ownerId)] }).catch(() => {});
  }
  if (config.vectorBackend === 'qdrant') {
    await fetch(`${config.qdrantUrl}/collections/deja_memories/points/delete?wait=true`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filter: { must: [{ key: 'ownerId', match: { value: ownerId } }] } }),
    }).catch(() => {});
  }
}
console.log(`\n${failures ? `${failures} check(s) failed` : 'All checks passed'} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exitCode = failures ? 1 : 0;
