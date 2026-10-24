// Idempotently provisions every Appwrite resource Déjà needs: `pnpm setup:appwrite`.
import { TablesDB, VectorsDB, VectorsDBIndexType } from 'node-appwrite';
import {
  EMBEDDING_DIMENSION,
  loadConfig,
  serverClient,
  TABLE_DEFS,
  TABLES_DB_ID,
  VECTOR_COLLECTION_ID,
  VECTOR_INDEX_KEY,
  VECTORS_DB_ID,
} from '@deja/core';

const config = loadConfig();
const client = serverClient(config);
const tables = new TablesDB(client);
const vectors = new VectorsDB(client);

const code = (err: unknown) => (err as { code?: number }).code;

/** Run `create`, treating "already exists" (409) as success. */
async function ensure(label: string, create: () => Promise<unknown>) {
  try {
    await create();
    console.log(`  ✓ created ${label}`);
  } catch (err) {
    if (code(err) === 409) console.log(`  · ${label} exists`);
    else throw new Error(`${label}: ${(err as Error).message}`);
  }
}

async function waitFor(label: string, check: () => Promise<string>, done = 'available') {
  for (let i = 0; i < 60; i++) {
    const status = await check();
    if (status === done) return;
    if (status === 'failed') throw new Error(`${label} failed to build`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} not ready after 60s`);
}

console.log(`Provisioning Déjà in project ${config.projectId}\n`);

console.log('TablesDB');
await ensure(`database ${TABLES_DB_ID}`, () => tables.create({ databaseId: TABLES_DB_ID, name: 'Déjà' }));
for (const def of TABLE_DEFS) {
  await ensure(`table ${def.id}`, () =>
    tables.createTable({
      databaseId: TABLES_DB_ID,
      tableId: def.id,
      name: def.name,
      // No table-level grants: every row carries read(user:<owner>), and the server writes with the API key.
      permissions: [],
      rowSecurity: true,
      columns: def.columns,
      indexes: def.indexes,
    }),
  );
}

console.log('\nVectorsDB');
await ensure(`database ${VECTORS_DB_ID}`, () => vectors.create({ databaseId: VECTORS_DB_ID, name: 'Déjà vectors' }));
await ensure(`collection ${VECTOR_COLLECTION_ID} (${EMBEDDING_DIMENSION}d)`, () =>
  vectors.createCollection({
    databaseId: VECTORS_DB_ID,
    collectionId: VECTOR_COLLECTION_ID,
    name: 'Memory embeddings',
    dimension: EMBEDDING_DIMENSION,
    permissions: [],
    documentSecurity: true,
  }),
);
await ensure(`index ${VECTOR_INDEX_KEY} (hnsw cosine)`, () =>
  vectors.createIndex({
    databaseId: VECTORS_DB_ID,
    collectionId: VECTOR_COLLECTION_ID,
    key: VECTOR_INDEX_KEY,
    type: VectorsDBIndexType.HnswCosine,
    attributes: ['embeddings'],
  }),
);
await waitFor('vector index', async () =>
  String(
    (await vectors.getIndex({ databaseId: VECTORS_DB_ID, collectionId: VECTOR_COLLECTION_ID, key: VECTOR_INDEX_KEY }))
      .status,
  ),
);

console.log('\nDone. Next: sign up on the dashboard, put your user id in DEJA_OWNER_ID, then `pnpm smoke`.');
