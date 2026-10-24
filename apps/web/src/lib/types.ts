import type { Conflict } from '@deja/core';
import type { Link, Memory, MemoryEvent, Session } from '@deja/core/types';

export type BrainMemory = Memory & { retention: number };

export interface BrainData {
  memories: BrainMemory[];
  links: Link[];
  conflicts: Conflict[];
  events: MemoryEvent[];
  sessions: Session[];
  ownerId: string;
  timeWarp: number;
  now: string;
}

export function eventText(e: MemoryEvent): string {
  const d = e.detail as Record<string, string | undefined>;
  switch (e.type) {
    case 'remembered':
      return d.content ?? '';
    case 'reinforced':
      return d.content ?? (d.via === 'resolve' ? 'kept after resolving a conflict' : '');
    case 'recalled':
      return d.query ? `for “${d.query}”` : '';
    case 'superseded':
      return `${d.from ?? ''} → ${d.to ?? ''}`;
    case 'conflict':
      return `${d.a ?? ''} ⟷ ${d.b ?? ''}`;
    case 'resolved':
      return `kept “${d.kept ?? ''}”`;
    case 'forgotten':
      return d.content ?? '';
    case 'session':
      return `connected · ${e.project}`;
  }
}

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}
