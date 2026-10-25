// Vector index with no extra service: memories come from TablesDB, vectors from Appwrite Embeddings
// (cached per process), similarity is computed in memory. Exact (no ANN), which is fine for a brain of
// a few hundred memories and lets a hosted deployment run on Appwrite alone. Select it with
// DEJA_VECTOR_BACKEND=tables.
import { Query, TablesDB, type Client } from 'node-appwrite';
import { cosineDistance } from './memory-store.ts';
import { T, TABLES_DB_ID } from './schema.ts';
import type { Embedder, VectorHit, VectorIndex } from './store.ts';

const MAX_MEMORIES = 2000;

export class TablesVectorIndex implements VectorIndex {
  readonly name = 'tables';
  private tables: TablesDB;
  /** memory id -> vector. Vectors only change when content changes, and content never does. */
  private cache = new Map<string, number[]>();

  constructor(
    client: Client,
    private embedder: Embedder,
  ) {
    this.tables = new TablesDB(client);
  }

  async search(ownerId: string, vector: number[], limit: number): Promise<VectorHit[]> {
    const rows: { id: string; content: string }[] = [];
    let cursor: string | undefined;
    while (rows.length < MAX_MEMORIES) {
      const page = await this.tables.listRows({
        databaseId: TABLES_DB_ID,
        tableId: T.memories,
        queries: [
          Query.equal('ownerId', ownerId),
          Query.notEqual('status', 'forgotten'),
          Query.select(['$id', 'content']),
          Query.orderAsc('$id'),
          Query.limit(500),
          ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ],
      });
      rows.push(...page.rows.map((r) => ({ id: r.$id, content: r.content as string })));
      if (page.rows.length < 500) break;
      cursor = page.rows.at(-1)!.$id;
    }

    const missing = rows.filter((r) => !this.cache.has(r.id));
    for (let i = 0; i < missing.length; i += 64) {
      const batch = missing.slice(i, i + 64);
      const vectors = await this.embedder.embed(batch.map((r) => r.content));
      batch.forEach((r, j) => this.cache.set(r.id, vectors[j]!));
    }

    return rows
      .map((r) => ({ id: r.id, distance: cosineDistance(vector, this.cache.get(r.id)!) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);
  }

  async put(id: string, vector: number[]) {
    // The memory row itself is written by the store; just remember the vector we already have.
    this.cache.set(id, vector);
  }

  async delete(id: string) {
    this.cache.delete(id);
  }
}
