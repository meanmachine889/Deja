export const KINDS = ['fact', 'preference', 'decision', 'convention', 'event', 'person'] as const;
export type Kind = (typeof KINDS)[number];

export const STATUSES = ['active', 'superseded', 'forgotten'] as const;
export type Status = (typeof STATUSES)[number];

export const LINK_TYPES = ['supersedes', 'contradicts', 'supports', 'related'] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export const EVENT_TYPES = [
  'remembered',
  'reinforced',
  'recalled',
  'superseded',
  'conflict',
  'resolved',
  'forgotten',
  'session',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface Memory {
  id: string;
  content: string;
  kind: Kind;
  project: string;
  status: Status;
  /** Days. Retention R = exp(-Δt / stability). */
  stability: number;
  recallCount: number;
  lastReinforcedAt: string;
  supersededBy: string | null;
  sessionId: string;
  agent: string;
  excerpt: string | null;
  confidence: number;
  ownerId: string;
  createdAt: string;
}

/** A directed edge. For `supersedes`, `fromId` is the newer memory and `toId` the one it replaced. */
export interface Link {
  id: string;
  fromId: string;
  toId: string;
  type: LinkType;
  reason: string;
  ownerId: string;
  resolved: boolean;
  createdAt: string;
}

export interface MemoryEvent {
  id: string;
  type: EventType;
  memoryId: string | null;
  sessionId: string;
  agent: string;
  project: string;
  detail: Record<string, unknown>;
  ownerId: string;
  createdAt: string;
}

export interface Session {
  id: string;
  agent: string;
  project: string;
  lastSeenAt: string;
  ownerId: string;
}

/** Who is acting. The MCP server builds one per connection; the dashboard builds one per request. */
export interface Ctx {
  ownerId: string;
  sessionId: string;
  agent: string;
  project: string;
}
