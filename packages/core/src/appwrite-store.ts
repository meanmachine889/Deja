// Store backed by Appwrite: VectorsDB holds the embeddings, TablesDB holds state, graph, events.
import { Client, EmbeddingModel, Embeddings, ID, Permission, Query, Role, TablesDB, VectorsDB } from 'node-appwrite';
import type { Models } from 'node-appwrite';
import type { DejaConfig } from './config.ts';
import { T, TABLES_DB_ID, VECTOR_COLLECTION_ID, VECTORS_DB_ID } from './schema.ts';
import type { Embedder, NewEvent, NewLink, NewMemory, Store, VectorHit } from './store.ts';
import type { EventType, Link, LinkType, Memory, MemoryEvent, Session, Status } from './types.ts';

export function serverClient(config: Pick<DejaConfig, 'endpoint' | 'projectId' | 'apiKey'>): Client {
  return new Client().setEndpoint(config.endpoint).setProject(config.projectId).setKey(config.apiKey);
}

const ownerPerms = (ownerId: string) => [Permission.read(Role.user(ownerId))];

type Row = Models.DefaultRow;

function toMemory(r: Row): Memory {
  return {
    id: r.$id,
    content: r.content,
    kind: r.kind,
    project: r.project,
    status: r.status,
    stability: r.stability,
    recallCount: r.recallCount ?? 0,
    lastReinforcedAt: r.lastReinforcedAt,
    supersededBy: r.supersededBy ?? null,
    sessionId: r.sessionId,
    agent: r.agent,
    excerpt: r.excerpt ?? null,
    confidence: r.confidence ?? 1,
    ownerId: r.ownerId,
    createdAt: r.storedAt ?? r.$createdAt,
  };
}

function toLink(r: Row): Link {
  return {
    id: r.$id,
    fromId: r.fromId,
    toId: r.toId,
    type: r.type,
    reason: r.reason ?? '',
    ownerId: r.ownerId,
    resolved: r.resolved ?? false,
    createdAt: r.$createdAt,
  };
}

function toEvent(r: Row): MemoryEvent {
  let detail: Record<string, unknown> = {};
  try {
    detail = r.detail ? JSON.parse(r.detail) : {};
  } catch {
    detail = { raw: r.detail };
  }
  return {
    id: r.$id,
    type: r.type,
    memoryId: r.memoryId ?? null,
    sessionId: r.sessionId,
    agent: r.agent,
    project: r.project,
    detail,
    ownerId: r.ownerId,
    createdAt: r.at ?? r.$createdAt,
  };
}

function toSession(r: Row): Session {
  return { id: r.$id, agent: r.agent, project: r.project, lastSeenAt: r.lastSeenAt, ownerId: r.ownerId };
}

function withoutCreatedAt<T extends { createdAt: string }>(x: T): Omit<T, 'createdAt'> {
  const { createdAt: _createdAt, ...rest } = x;
  return rest;
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 404;
}

export class AppwriteStore implements Store {
  private tables: TablesDB;
  private vectors: VectorsDB;
  /** Set to false the first time a metadata filter is rejected; we then post-filter by ownerId. */
  private metadataFilter = true;

  constructor(client: Client) {
    this.tables = new TablesDB(client);
    this.vectors = new VectorsDB(client);
  }

  async vectorSearch(ownerId: string, vector: number[], limit: number): Promise<VectorHit[]> {
    const base = [Query.vectorCosine('embeddings', vector), Query.limit(limit)];
    const run = (queries: string[]) =>
      // POST variant: a 768-d vector is ~9 KB, too big to trust to a URL.
      this.vectors.createQuery({ databaseId: VECTORS_DB_ID, collectionId: VECTOR_COLLECTION_ID, queries });
    let res: Models.DocumentList<Models.DefaultDocument>;
    if (this.metadataFilter) {
      try {
        res = await run([...base, Query.equal('metadata.ownerId', ownerId)]);
      } catch {
        this.metadataFilter = false;
        res = await run(base);
      }
    } else {
      res = await run(base);
    }
    return res.documents
      .filter((d) => (d.metadata as { ownerId?: string } | undefined)?.ownerId === ownerId)
      .map((d) => ({ id: d.$id, distance: Number(d.$distance ?? 1) }));
  }

  async putVector(id: string, vector: number[], metadata: Record<string, unknown>) {
    await this.vectors.createDocument({
      databaseId: VECTORS_DB_ID,
      collectionId: VECTOR_COLLECTION_ID,
      documentId: id,
      data: { embeddings: vector, metadata },
      permissions: ownerPerms(String(metadata.ownerId)),
    });
  }

  async deleteVector(id: string) {
    try {
      await this.vectors.deleteDocument({ databaseId: VECTORS_DB_ID, collectionId: VECTOR_COLLECTION_ID, documentId: id });
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }

  async getMemory(id: string) {
    try {
      return toMemory(await this.tables.getRow({ databaseId: TABLES_DB_ID, tableId: T.memories, rowId: id }));
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async getMemories(ids: string[]) {
    if (ids.length === 0) return [];
    const res = await this.tables.listRows({
      databaseId: TABLES_DB_ID,
      tableId: T.memories,
      queries: [Query.equal('$id', ids), Query.limit(ids.length)],
    });
    return res.rows.map(toMemory);
  }

  async insertMemory(memory: NewMemory) {
    const { id, createdAt, ...rest } = memory;
    const row = await this.tables.createRow({
      databaseId: TABLES_DB_ID,
      tableId: T.memories,
      rowId: id,
      data: { ...rest, storedAt: createdAt },
      permissions: ownerPerms(memory.ownerId),
    });
    return toMemory(row);
  }

  async updateMemory(id: string, patch: Partial<NewMemory>) {
    const { id: _id, createdAt: _createdAt, ...data } = patch;
    return toMemory(await this.tables.updateRow({ databaseId: TABLES_DB_ID, tableId: T.memories, rowId: id, data }));
  }

  async listMemories(ownerId: string, opts: { project?: string; status?: Status; limit?: number } = {}) {
    const queries = [Query.equal('ownerId', ownerId), Query.orderDesc('storedAt'), Query.limit(opts.limit ?? 500)];
    if (opts.project) queries.push(Query.equal('project', opts.project));
    if (opts.status) queries.push(Query.equal('status', opts.status));
    const res = await this.tables.listRows({ databaseId: TABLES_DB_ID, tableId: T.memories, queries });
    return res.rows.map(toMemory);
  }

  async insertLink(link: NewLink) {
    const row = await this.tables.createRow({
      databaseId: TABLES_DB_ID,
      tableId: T.links,
      rowId: ID.unique(),
      data: link,
      permissions: ownerPerms(link.ownerId),
    });
    return toLink(row);
  }

  async getLink(id: string) {
    try {
      return toLink(await this.tables.getRow({ databaseId: TABLES_DB_ID, tableId: T.links, rowId: id }));
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async updateLink(id: string, patch: Partial<NewLink>) {
    return toLink(await this.tables.updateRow({ databaseId: TABLES_DB_ID, tableId: T.links, rowId: id, data: patch }));
  }

  async listLinks(
    ownerId: string,
    opts: { memoryIds?: string[]; type?: LinkType; resolved?: boolean; limit?: number } = {},
  ) {
    const queries = [Query.equal('ownerId', ownerId), Query.limit(opts.limit ?? 500)];
    if (opts.memoryIds) {
      if (opts.memoryIds.length === 0) return [];
      queries.push(Query.or([Query.equal('fromId', opts.memoryIds), Query.equal('toId', opts.memoryIds)]));
    }
    if (opts.type) queries.push(Query.equal('type', opts.type));
    if (opts.resolved !== undefined) queries.push(Query.equal('resolved', opts.resolved));
    const res = await this.tables.listRows({ databaseId: TABLES_DB_ID, tableId: T.links, queries });
    return res.rows.map(toLink);
  }

  async insertEvent(event: NewEvent) {
    const row = await this.tables.createRow({
      databaseId: TABLES_DB_ID,
      tableId: T.events,
      rowId: ID.unique(),
      data: { ...withoutCreatedAt(event), at: event.createdAt, detail: JSON.stringify(event.detail) },
      permissions: ownerPerms(event.ownerId),
    });
    return toEvent(row);
  }

  async listEvents(ownerId: string, opts: { project?: string; types?: EventType[]; limit?: number } = {}) {
    const queries = [Query.equal('ownerId', ownerId), Query.orderDesc('at'), Query.limit(opts.limit ?? 50)];
    if (opts.project) queries.push(Query.equal('project', opts.project));
    if (opts.types) queries.push(Query.equal('type', opts.types));
    const res = await this.tables.listRows({ databaseId: TABLES_DB_ID, tableId: T.events, queries });
    return res.rows.map(toEvent);
  }

  async upsertSession(session: Session) {
    const { id, ...data } = session;
    const row = await this.tables.upsertRow({
      databaseId: TABLES_DB_ID,
      tableId: T.sessions,
      rowId: id,
      data,
      permissions: ownerPerms(session.ownerId),
    });
    return toSession(row);
  }

  async getSession(id: string) {
    try {
      return toSession(await this.tables.getRow({ databaseId: TABLES_DB_ID, tableId: T.sessions, rowId: id }));
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async listSessions(ownerId: string, limit = 20) {
    const res = await this.tables.listRows({
      databaseId: TABLES_DB_ID,
      tableId: T.sessions,
      queries: [Query.equal('ownerId', ownerId), Query.orderDesc('lastSeenAt'), Query.limit(limit)],
    });
    return res.rows.map(toSession);
  }
}

export class AppwriteEmbedder implements Embedder {
  private embeddings: Embeddings;
  constructor(client: Client) {
    this.embeddings = new Embeddings(client);
  }
  async embed(texts: string[]) {
    const res = await this.embeddings.createTextEmbeddings({ texts, model: EmbeddingModel.Nomicembedtext });
    return res.embeddings.map((e) => {
      if (e.embedding.length === 0) throw new Error('Appwrite Embeddings returned an empty vector');
      return e.embedding;
    });
  }
}
