// Embeddings in Qdrant (local Docker by default). Free-plan Appwrite projects can't create a VectorsDB,
// so this is the default vector index; state and everything else stays in Appwrite TablesDB.
import { EMBEDDING_DIMENSION } from './schema.ts';
import type { VectorHit, VectorIndex } from './store.ts';

export const QDRANT_COLLECTION = 'deja_memories';

export class QdrantVectorIndex implements VectorIndex {
  readonly name = 'qdrant';

  constructor(
    private url: string,
    private apiKey?: string,
    private collection = QDRANT_COLLECTION,
  ) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.apiKey) headers['api-key'] = this.apiKey;
    let res: Response;
    try {
      res = await fetch(`${this.url.replace(/\/$/, '')}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(`Qdrant unreachable at ${this.url} (is \`docker compose up -d\` running?): ${(err as Error).message}`);
    }
    const data = (await res.json().catch(() => ({}))) as { result?: T; status?: { error?: string } };
    if (!res.ok) throw Object.assign(new Error(`Qdrant ${method} ${path}: ${data.status?.error ?? res.status}`), { code: res.status });
    return data.result as T;
  }

  /** Create the collection and the ownerId payload index if they don't exist. Returns true if created. */
  async ensure(): Promise<boolean> {
    const exists = await this.call<{ exists: boolean }>('GET', `/collections/${this.collection}/exists`);
    if (exists.exists) return false;
    await this.call('PUT', `/collections/${this.collection}`, {
      vectors: { size: EMBEDDING_DIMENSION, distance: 'Cosine' },
      hnsw_config: { m: 16, ef_construct: 128 },
    });
    await this.call('PUT', `/collections/${this.collection}/index?wait=true`, { field_name: 'ownerId', field_schema: 'keyword' });
    return true;
  }

  async search(ownerId: string, vector: number[], limit: number): Promise<VectorHit[]> {
    const res = await this.call<{ points: { id: string; score: number }[] }>('POST', `/collections/${this.collection}/points/query`, {
      query: vector,
      limit,
      filter: { must: [{ key: 'ownerId', match: { value: ownerId } }] },
      with_payload: false,
    });
    // Qdrant's cosine score is similarity; the engine works in distance (0 = identical).
    return res.points.map((p) => ({ id: String(p.id), distance: 1 - p.score }));
  }

  async put(id: string, vector: number[], metadata: { ownerId: string; project: string; kind: string }) {
    await this.call('PUT', `/collections/${this.collection}/points?wait=true`, { points: [{ id, vector, payload: metadata }] });
  }

  async delete(id: string) {
    await this.call('POST', `/collections/${this.collection}/points/delete?wait=true`, { points: [id] });
  }
}
