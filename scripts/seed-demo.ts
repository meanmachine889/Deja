// Seeds the demo story (two months of agents working on "acme-shop") into DEJA_OWNER_ID's brain.
// `pnpm seed:demo` · `pnpm seed:demo --reset` removes previously seeded demo data first.
// Demo rows are recognisable by their `demo-` session ids, so real memories are never touched.
import { Query, TablesDB } from 'node-appwrite';
import {
  AppwriteEmbedder,
  AppwriteStore,
  createVectorIndex,
  DEMO_PROJECT,
  loadConfig,
  seedDemo,
  serverClient,
  T,
  TABLES_DB_ID,
} from '@deja/core';

const config = loadConfig();
if (!config.ownerId) throw new Error('Set DEJA_OWNER_ID in .env first (sign up on the dashboard /login page).');
const ownerId = config.ownerId;
const client = serverClient(config);
const tables = new TablesDB(client);
const vectors = createVectorIndex(config);
const demoQuery = [Query.equal('ownerId', ownerId), Query.startsWith('sessionId', 'demo-')];

async function demoMemoryIds(): Promise<string[]> {
  const res = await tables.listRows({ databaseId: TABLES_DB_ID, tableId: T.memories, queries: [...demoQuery, Query.limit(500)] });
  return res.rows.map((r) => r.$id);
}

const existing = await demoMemoryIds();
if (existing.length && !process.argv.includes('--reset')) {
  console.log(`Demo already seeded (${existing.length} memories). Run with --reset to reseed.`);
  process.exit(0);
}

if (existing.length) {
  console.log(`Removing ${existing.length} demo memories…`);
  for (let i = 0; i < existing.length; i += 50) {
    const ids = existing.slice(i, i + 50);
    await tables.deleteRows({
      databaseId: TABLES_DB_ID,
      tableId: T.links,
      queries: [Query.equal('ownerId', ownerId), Query.or([Query.equal('fromId', ids), Query.equal('toId', ids)])],
    });
  }
  await tables.deleteRows({ databaseId: TABLES_DB_ID, tableId: T.memories, queries: demoQuery });
  await tables.deleteRows({ databaseId: TABLES_DB_ID, tableId: T.events, queries: demoQuery });
  await tables.deleteRows({
    databaseId: TABLES_DB_ID,
    tableId: T.sessions,
    queries: [Query.equal('ownerId', ownerId), Query.startsWith('$id', 'demo-')],
  });
  await Promise.all(existing.map((id) => vectors.delete(id)));
}

console.log(`Seeding "${DEMO_PROJECT}" for owner ${ownerId} (vectors: ${vectors.name})…`);
const t0 = Date.now();
await seedDemo({
  store: new AppwriteStore(client, vectors),
  embedder: new AppwriteEmbedder(client),
  ownerId,
  log: (line) => console.log(line),
});
console.log(`Done in ${Math.round((Date.now() - t0) / 1000)}s. Open http://localhost:3100/brain`);
