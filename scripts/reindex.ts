// Rebuilds the vector index from TablesDB: `pnpm reindex`.
// TablesDB is the source of truth, so any index (a new Qdrant Cloud cluster, VectorsDB) can be
// rebuilt from it. Re-embeds every memory with Appwrite Embeddings and upserts it into the index
// configured in .env (DEJA_VECTOR_BACKEND / QDRANT_URL / QDRANT_API_KEY).
import { Query, TablesDB } from 'node-appwrite';
import { AppwriteEmbedder, createVectorIndex, loadConfig, QdrantVectorIndex, serverClient, T, TABLES_DB_ID } from '@deja/core';

const config = loadConfig();
const client = serverClient(config);
const tables = new TablesDB(client);
const embedder = new AppwriteEmbedder(client);
const index = createVectorIndex(config);

if (index instanceof QdrantVectorIndex) {
  const created = await index.ensure();
  console.log(`Qdrant ${config.qdrantUrl}: collection ${created ? 'created' : 'exists'}`);
}

let cursor: string | undefined;
let done = 0;
const t0 = Date.now();
for (;;) {
  const page = await tables.listRows({
    databaseId: TABLES_DB_ID,
    tableId: T.memories,
    queries: [Query.limit(50), Query.orderAsc('$id'), ...(cursor ? [Query.cursorAfter(cursor)] : [])],
  });
  if (page.rows.length === 0) break;
  const vectors = await embedder.embed(page.rows.map((r) => r.content as string));
  await Promise.all(
    page.rows.map((r, i) => index.put(r.$id, vectors[i]!, { ownerId: r.ownerId, project: r.project, kind: r.kind })),
  );
  done += page.rows.length;
  cursor = page.rows.at(-1)!.$id;
  console.log(`  indexed ${done}`);
}
console.log(`Reindexed ${done} memories into ${index.name} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
