// In-process Store + Embedder used by tests and the offline demo. Mirrors AppwriteStore semantics.
import { randomUUID } from 'node:crypto';
import type { Embedder, NewEvent, NewLink, NewMemory, Store, VectorHit } from './store.ts';
import type { EventType, Link, LinkType, Memory, MemoryEvent, Session, Status } from './types.ts';

export function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 1;
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export class MemoryStore implements Store {
  private vectors = new Map<string, { vector: number[]; ownerId: string }>();
  private memories = new Map<string, Memory>();
  private links = new Map<string, Link>();
  private events: MemoryEvent[] = [];
  private sessions = new Map<string, Session>();
  constructor(private now: () => Date = () => new Date()) {}

  async vectorSearch(ownerId: string, vector: number[], limit: number): Promise<VectorHit[]> {
    return [...this.vectors.entries()]
      .filter(([, v]) => v.ownerId === ownerId)
      .map(([id, v]) => ({ id, distance: cosineDistance(vector, v.vector) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);
  }
  async putVector(id: string, vector: number[], metadata: { ownerId: string }) {
    this.vectors.set(id, { vector, ownerId: String(metadata.ownerId) });
  }
  async deleteVector(id: string) {
    this.vectors.delete(id);
  }

  async getMemory(id: string) {
    return this.memories.get(id) ?? null;
  }
  async getMemories(ids: string[]) {
    return ids.flatMap((id) => this.memories.get(id) ?? []);
  }
  async insertMemory(memory: NewMemory) {
    const row = { ...memory };
    this.memories.set(row.id, row);
    return row;
  }
  async updateMemory(id: string, patch: Partial<NewMemory>) {
    const existing = this.memories.get(id);
    if (!existing) throw new Error(`memory ${id} not found`);
    const row = { ...existing, ...patch };
    this.memories.set(id, row);
    return row;
  }
  async listMemories(ownerId: string, opts: { project?: string; status?: Status; limit?: number } = {}) {
    return [...this.memories.values()]
      .filter((m) => m.ownerId === ownerId)
      .filter((m) => !opts.project || m.project === opts.project)
      .filter((m) => !opts.status || m.status === opts.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, opts.limit ?? 500);
  }

  async insertLink(link: NewLink) {
    const row = { ...link, id: randomUUID(), createdAt: this.now().toISOString() };
    this.links.set(row.id, row);
    return row;
  }
  async getLink(id: string) {
    return this.links.get(id) ?? null;
  }
  async updateLink(id: string, patch: Partial<NewLink>) {
    const existing = this.links.get(id);
    if (!existing) throw new Error(`link ${id} not found`);
    const row = { ...existing, ...patch };
    this.links.set(id, row);
    return row;
  }
  async listLinks(
    ownerId: string,
    opts: { memoryIds?: string[]; type?: LinkType; resolved?: boolean; limit?: number } = {},
  ) {
    const ids = opts.memoryIds && new Set(opts.memoryIds);
    return [...this.links.values()]
      .filter((l) => l.ownerId === ownerId)
      .filter((l) => !ids || ids.has(l.fromId) || ids.has(l.toId))
      .filter((l) => !opts.type || l.type === opts.type)
      .filter((l) => opts.resolved === undefined || l.resolved === opts.resolved)
      .slice(0, opts.limit ?? 500);
  }

  async insertEvent(event: NewEvent) {
    const row = { ...event, id: randomUUID() };
    this.events.push(row);
    this.events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return row;
  }
  async listEvents(ownerId: string, opts: { project?: string; types?: EventType[]; limit?: number } = {}) {
    return this.events
      .filter((e) => e.ownerId === ownerId)
      .filter((e) => !opts.project || e.project === opts.project)
      .filter((e) => !opts.types || opts.types.includes(e.type))
      .slice()
      .reverse()
      .slice(0, opts.limit ?? 50);
  }

  async upsertSession(session: Session) {
    this.sessions.set(session.id, session);
    return session;
  }
  async getSession(id: string) {
    return this.sessions.get(id) ?? null;
  }
  async listSessions(ownerId: string, limit = 20) {
    return [...this.sessions.values()].filter((s) => s.ownerId === ownerId).slice(0, limit);
  }
}

/**
 * Deterministic bag-of-words embedder (hashed unigrams + bigrams). Not semantic, but similar
 * sentences land close together, which is all the tests need.
 */
export class HashEmbedder implements Embedder {
  constructor(private dimension = 256) {}
  async embed(texts: string[]) {
    return texts.map((text) => {
      const v = new Array<number>(this.dimension).fill(0);
      const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
      const grams = [...words, ...words.slice(1).map((w, i) => `${words[i]} ${w}`)];
      for (const g of grams) {
        let h = 2166136261;
        for (let i = 0; i < g.length; i++) h = Math.imul(h ^ g.charCodeAt(i), 16777619);
        v[Math.abs(h) % this.dimension]! += 1;
      }
      return v;
    });
  }
}
