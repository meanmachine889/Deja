// Appwrite resource IDs and definitions. Used by scripts/setup.ts and by the store, so they can't drift.
import { EVENT_TYPES, KINDS, LINK_TYPES, STATUSES } from './types.ts';

export const TABLES_DB_ID = 'deja';
export const VECTORS_DB_ID = 'deja_vectors';
export const VECTOR_COLLECTION_ID = 'memories';
export const VECTOR_INDEX_KEY = 'embeddings_cosine';
/** nomic-embed-text, Appwrite's default embedding model. */
export const EMBEDDING_DIMENSION = 768;

export const T = {
  memories: 'memories',
  links: 'links',
  events: 'events',
  sessions: 'sessions',
} as const;

type Column =
  | { key: string; type: 'varchar'; size: number; required: boolean; array?: boolean }
  | { key: string; type: 'text'; required: boolean }
  | { key: string; type: 'integer'; required: boolean; default?: number }
  | { key: string; type: 'double'; required: boolean; default?: number }
  | { key: string; type: 'boolean'; required: boolean; default?: boolean }
  | { key: string; type: 'datetime'; required: boolean }
  | { key: string; type: 'enum'; elements: readonly string[]; required: boolean };

interface Index {
  key: string;
  type: 'key' | 'fulltext' | 'unique';
  attributes: string[];
}

export interface TableDef {
  id: string;
  name: string;
  columns: Column[];
  indexes: Index[];
}

const id36 = (key: string, required = true): Column => ({ key, type: 'varchar', size: 36, required });

export const TABLE_DEFS: TableDef[] = [
  {
    id: T.memories,
    name: 'Memories',
    columns: [
      { key: 'content', type: 'text', required: true },
      { key: 'kind', type: 'enum', elements: KINDS, required: true },
      { key: 'project', type: 'varchar', size: 64, required: true },
      { key: 'status', type: 'enum', elements: STATUSES, required: true },
      { key: 'stability', type: 'double', required: true },
      { key: 'recallCount', type: 'integer', required: false, default: 0 },
      { key: 'lastReinforcedAt', type: 'datetime', required: true },
      id36('supersededBy', false),
      id36('sessionId'),
      { key: 'agent', type: 'varchar', size: 64, required: true },
      { key: 'excerpt', type: 'text', required: false },
      { key: 'confidence', type: 'double', required: false, default: 1 },
      id36('ownerId'),
      // Engine-clock creation time (differs from $createdAt when seeding history).
      { key: 'storedAt', type: 'datetime', required: true },
    ],
    indexes: [
      { key: 'owner_project_status', type: 'key', attributes: ['ownerId', 'project', 'status'] },
      { key: 'owner_status', type: 'key', attributes: ['ownerId', 'status'] },
    ],
  },
  {
    id: T.links,
    name: 'Links',
    columns: [
      id36('fromId'),
      id36('toId'),
      { key: 'type', type: 'enum', elements: LINK_TYPES, required: true },
      { key: 'reason', type: 'text', required: false },
      id36('ownerId'),
      { key: 'resolved', type: 'boolean', required: false, default: false },
    ],
    indexes: [
      { key: 'owner_type', type: 'key', attributes: ['ownerId', 'type', 'resolved'] },
      { key: 'from', type: 'key', attributes: ['fromId'] },
      { key: 'to', type: 'key', attributes: ['toId'] },
    ],
  },
  {
    id: T.events,
    name: 'Events',
    columns: [
      { key: 'type', type: 'enum', elements: EVENT_TYPES, required: true },
      id36('memoryId', false),
      id36('sessionId'),
      { key: 'agent', type: 'varchar', size: 64, required: true },
      { key: 'project', type: 'varchar', size: 64, required: true },
      { key: 'detail', type: 'text', required: false },
      id36('ownerId'),
      { key: 'at', type: 'datetime', required: true },
    ],
    indexes: [
      { key: 'owner_at', type: 'key', attributes: ['ownerId', 'at'] },
      { key: 'owner_project', type: 'key', attributes: ['ownerId', 'project'] },
      { key: 'memory', type: 'key', attributes: ['memoryId'] },
    ],
  },
  {
    id: T.sessions,
    name: 'Sessions',
    columns: [
      { key: 'agent', type: 'varchar', size: 64, required: true },
      { key: 'project', type: 'varchar', size: 64, required: true },
      { key: 'lastSeenAt', type: 'datetime', required: true },
      id36('ownerId'),
    ],
    indexes: [{ key: 'owner_seen', type: 'key', attributes: ['ownerId', 'lastSeenAt'] }],
  },
];
