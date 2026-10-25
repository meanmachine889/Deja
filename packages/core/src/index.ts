import { AppwriteEmbedder, AppwriteStore, AppwriteVectorIndex, serverClient } from './appwrite-store.ts';
import { QdrantVectorIndex } from './qdrant.ts';
import { TablesVectorIndex } from './tables-index.ts';
import type { DejaConfig } from './config.ts';
import { Deja } from './engine.ts';
import { ClaudeJudge, HeuristicJudge } from './judge.ts';

export * from './types.ts';
export * from './decay.ts';
export * from './config.ts';
export * from './store.ts';
export * from './engine.ts';
export * from './judge.ts';
export { AppwriteStore, AppwriteEmbedder, AppwriteVectorIndex, serverClient } from './appwrite-store.ts';
export { QdrantVectorIndex, QDRANT_COLLECTION } from './qdrant.ts';
export { TablesVectorIndex } from './tables-index.ts';
export { MemoryStore, HashEmbedder, cosineDistance } from './memory-store.ts';

export function createVectorIndex(config: DejaConfig) {
  const client = serverClient(config);
  if (config.vectorBackend === 'appwrite') return new AppwriteVectorIndex(client);
  if (config.vectorBackend === 'tables') return new TablesVectorIndex(client, new AppwriteEmbedder(client));
  return new QdrantVectorIndex(config.qdrantUrl, config.qdrantApiKey);
}

/** Wire the engine to Appwrite TablesDB + the configured vector index + Claude from config. */
export function createDeja(config: DejaConfig): Deja {
  const client = serverClient(config);
  return new Deja({
    store: new AppwriteStore(client, createVectorIndex(config)),
    embedder: new AppwriteEmbedder(client),
    judge: config.anthropicKey ? new ClaudeJudge(config.anthropicKey, config.model) : new HeuristicJudge(),
    timeWarp: config.timeWarp,
  });
}
export * from './schema.ts';
export * from './demo.ts';
