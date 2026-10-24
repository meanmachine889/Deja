import type { EventType, Link, LinkType, Memory, MemoryEvent, Session, Status } from './types.ts';

export interface VectorHit {
  id: string;
  /** Cosine distance, 0 = identical. */
  distance: number;
}

export type NewMemory = Omit<Memory, 'createdAt'>;
export type NewLink = Omit<Link, 'id' | 'createdAt'>;
export type NewEvent = Omit<MemoryEvent, 'id' | 'createdAt'>;

/**
 * Persistence boundary. AppwriteStore splits it across VectorsDB (vectors) and TablesDB (everything
 * else); MemoryStore is an in-process fake for tests and offline demos.
 */
export interface Store {
  vectorSearch(ownerId: string, vector: number[], limit: number): Promise<VectorHit[]>;
  putVector(id: string, vector: number[], metadata: Record<string, unknown>): Promise<void>;
  deleteVector(id: string): Promise<void>;

  getMemory(id: string): Promise<Memory | null>;
  getMemories(ids: string[]): Promise<Memory[]>;
  insertMemory(memory: NewMemory): Promise<Memory>;
  updateMemory(id: string, patch: Partial<NewMemory>): Promise<Memory>;
  listMemories(ownerId: string, opts?: { project?: string; status?: Status; limit?: number }): Promise<Memory[]>;

  insertLink(link: NewLink): Promise<Link>;
  getLink(id: string): Promise<Link | null>;
  updateLink(id: string, patch: Partial<NewLink>): Promise<Link>;
  listLinks(
    ownerId: string,
    opts?: { memoryIds?: string[]; type?: LinkType; resolved?: boolean; limit?: number },
  ): Promise<Link[]>;

  insertEvent(event: NewEvent): Promise<MemoryEvent>;
  listEvents(ownerId: string, opts?: { project?: string; types?: EventType[]; limit?: number }): Promise<MemoryEvent[]>;

  upsertSession(session: Session): Promise<Session>;
  getSession(id: string): Promise<Session | null>;
  listSessions(ownerId: string, limit?: number): Promise<Session[]>;
}

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}
