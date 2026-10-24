import { AppwriteEmbedder, AppwriteStore, serverClient } from './appwrite-store.ts';
import type { DejaConfig } from './config.ts';
import { Deja } from './engine.ts';
import { ClaudeJudge, HeuristicJudge } from './judge.ts';

export * from './types.ts';
export * from './decay.ts';
export * from './config.ts';
export * from './store.ts';
export * from './engine.ts';
export * from './judge.ts';
export { AppwriteStore, AppwriteEmbedder, serverClient } from './appwrite-store.ts';
export { MemoryStore, HashEmbedder, cosineDistance } from './memory-store.ts';

/** Wire the engine to Appwrite + Claude from config. */
export function createDeja(config: DejaConfig): Deja {
  const client = serverClient(config);
  return new Deja({
    store: new AppwriteStore(client),
    embedder: new AppwriteEmbedder(client),
    judge: config.anthropicKey ? new ClaudeJudge(config.anthropicKey, config.model) : new HeuristicJudge(),
    timeWarp: config.timeWarp,
  });
}
export * from './schema.ts';
