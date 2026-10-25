'use client';
import type { RecallHit, RememberResult, WhyResult } from '@deja/core';
import { daysUntilFaded, FADED_THRESHOLD } from '@deja/core/decay';
import { KINDS, type Kind, type Memory, type MemoryEvent, type Session } from '@deja/core/types';
import { ArrowUpRight, Check, Clock, GitBranch, Search, Sparkles, Trash2, X, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/browser';
import { ago, eventText, type BrainData } from '@/lib/types';
import { KIND_RGB, retentionAt } from './Constellation';

const rgb = (k: Kind, a = 1) => `rgba(${KIND_RGB[k].join(',')},${a})`;
const pct = (r: number) => `${Math.round(r * 100)}%`;

export function KindDot({ kind, size = 8 }: { kind: Kind; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: rgb(kind) }}
    />
  );
}

export function Pill({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 border border-line px-2.5 py-1 text-[11px] text-ink-2 ${className}`}>
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ top bar

export function AskBar(props: {
  readOnly?: boolean;
  project: string;
  onResults: (hits: RecallHit[]) => void;
  onTaught: (res: RememberResult) => void;
}) {
  const [mode, setMode] = useState<'ask' | 'teach'>('ask');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const project = props.project === 'all' ? undefined : props.project;
      if (mode === 'ask') props.onResults(await api<RecallHit[]>('/api/recall', { body: { query: value, project } }));
      else {
        props.onTaught(await api<RememberResult>('/api/remember', { body: { content: value, project } }));
        setValue('');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="glass flex w-full max-w-xl items-center gap-1 p-1 pl-1.5">
      <div className="flex shrink-0 bg-white/[0.04] p-0.5 text-xs">
        {(props.readOnly ? (['ask'] as const) : (['ask', 'teach'] as const)).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={` px-3 py-1.5 capitalize transition ${mode === m ? 'bg-ink text-void' : 'text-mute hover:text-ink'}`}
          >
            {m}
          </button>
        ))}
      </div>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={mode === 'ask' ? 'Ask your brain… “which database do we use?”' : 'Teach it something… “we switched to Bun”'}
        className="min-w-0 flex-1 bg-transparent px-2 text-sm text-ink placeholder:text-faint focus:outline-none"
        aria-label={mode === 'ask' ? 'Ask your brain' : 'Teach your brain'}
      />
      {error && <span className="hidden truncate text-xs text-conflict sm:block">{error}</span>}
      <button
        type="submit"
        disabled={busy}
        className="flex h-8 w-8 shrink-0 items-center justify-center bg-amber text-void transition hover:brightness-110 disabled:opacity-50"
        aria-label="Submit"
      >
        {mode === 'ask' ? <Search size={15} /> : <Sparkles size={15} />}
      </button>
    </form>
  );
}

// ------------------------------------------------------------------ left rail

export function StatsPanel(props: {
  memories: Memory[];
  conflicts: number;
  warpDays: number;
  timeWarp: number;
  sessions: Session[];
  hiddenKinds: Set<Kind>;
  toggleKind: (k: Kind) => void;
}) {
  const stats = useMemo(() => {
    const active = props.memories.filter((m) => m.status === 'active');
    const rs = active.map((m) => retentionAt(m, props.warpDays, props.timeWarp));
    return {
      active: active.length,
      superseded: props.memories.length - active.length,
      faded: rs.filter((r) => r < FADED_THRESHOLD).length,
      avg: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0,
    };
  }, [props.memories, props.warpDays, props.timeWarp]);
  const live = props.sessions.filter((s) => Date.now() - new Date(s.lastSeenAt).getTime() < 3 * 60_000);
  const counts = useMemo(() => {
    const c = new Map<Kind, number>();
    for (const m of props.memories) if (m.status === 'active') c.set(m.kind, (c.get(m.kind) ?? 0) + 1);
    return c;
  }, [props.memories]);

  return (
    <aside className="glass pointer-events-auto w-60 p-5">
      <div className="grid grid-cols-2 gap-x-4 gap-y-5">
        <Stat value={stats.active} label="active memories" />
        <Stat value={pct(stats.avg)} label="avg retention" accent />
        <Stat value={stats.superseded} label="superseded" />
        <Stat value={props.conflicts} label="open conflicts" warn={props.conflicts > 0} />
      </div>
      {stats.faded > 0 && (
        <p className="mt-4 text-xs text-mute">
          <span className="text-ink-2">{stats.faded}</span> faded below {pct(FADED_THRESHOLD)}{' '}
          {props.warpDays > 0 ? `in ${props.warpDays} days` : 'today'}
        </p>
      )}
      <div className="mt-5 border-t border-line pt-4">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">Kinds</p>
        <div className="flex flex-col gap-0.5">
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => props.toggleKind(k)}
              className={`flex items-center justify-between px-2 py-1 text-xs capitalize transition hover:bg-white/[0.04] ${props.hiddenKinds.has(k) ? 'opacity-35' : ''}`}
            >
              <span className="flex items-center gap-2 text-ink-2">
                <KindDot kind={k} size={7} /> {k}
              </span>
              <span className="font-mono text-faint">{counts.get(k) ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 border-t border-line pt-4">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">Agents</p>
        {props.sessions.length === 0 && <p className="text-xs text-mute">No agent has connected yet.</p>}
        <div className="flex flex-wrap gap-1.5">
          {[...new Map(props.sessions.map((s) => [s.agent, s])).values()].map((s) => {
            const on = live.some((l) => l.agent === s.agent);
            return (
              <Pill key={s.agent}>
                <span className={`h-1.5 w-1.5 rounded-full ${on ? 'animate-pulse-dot bg-[#8fc4a2]' : 'bg-faint'}`} />
                {s.agent}
              </Pill>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function Stat({ value, label, accent, warn }: { value: React.ReactNode; label: string; accent?: boolean; warn?: boolean }) {
  return (
    <div>
      <div className={`font-serif text-[34px] leading-none ${warn ? 'text-conflict' : accent ? 'text-amber' : 'text-ink'}`}>{value}</div>
      <div className="mt-1.5 text-[11px] leading-tight text-mute">{label}</div>
    </div>
  );
}

// ------------------------------------------------------------------ right rail

const EVENT_STYLE: Record<MemoryEvent['type'], { label: string; color: string }> = {
  remembered: { label: 'remembered', color: '#f2ede6' },
  reinforced: { label: 'reinforced', color: '#d6b684' },
  recalled: { label: 'recalled', color: '#d6b684' },
  superseded: { label: 'superseded', color: '#96acd0' },
  conflict: { label: 'conflict', color: '#d6786a' },
  resolved: { label: 'resolved', color: '#96c2aa' },
  forgotten: { label: 'forgot', color: '#8a8780' },
  session: { label: 'joined', color: '#8fc4a2' },
};

/** Collapse bursts (one recall returning five memories) into a single feed row. */
function groupEvents(events: MemoryEvent[]) {
  const groups: { head: MemoryEvent; count: number; ids: string[] }[] = [];
  for (const e of events) {
    const last = groups.at(-1);
    const key = (x: MemoryEvent) => `${x.agent}|${x.type}|${(x.detail as { query?: string }).query ?? x.id}`;
    if (last && key(last.head) === key(e)) {
      last.count++;
      last.ids.push(e.id);
    } else groups.push({ head: e, count: 1, ids: [e.id] });
  }
  return groups;
}

export function Feed({
  events,
  fresh,
  live = true,
  onPick,
}: {
  events: MemoryEvent[];
  fresh: Set<string>;
  live?: boolean;
  onPick: (id: string) => void;
}) {
  const groups = useMemo(() => groupEvents(events), [events]);
  return (
    <aside className="glass pointer-events-auto flex max-h-full w-72 flex-col">
      <div className="flex items-center justify-between px-5 pb-2 pt-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">{live ? 'Live' : 'Activity'}</p>
        {live && (
          <span className="flex items-center gap-1.5 text-[11px] text-mute">
            <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-amber" /> realtime
          </span>
        )}
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {groups.map(({ head: e, count, ids }) => {
          const s = EVENT_STYLE[e.type];
          return (
            <li key={e.id} className={ids.some((id) => fresh.has(id)) ? 'animate-slide-in' : ''}>
              <button
                onClick={() => e.memoryId && onPick(e.memoryId)}
                className="w-full px-3 py-2 text-left transition hover:bg-white/[0.04]"
              >
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="font-medium text-ink-2">{e.agent}</span>
                  <span style={{ color: s.color }}>
                    {s.label}
                    {count > 1 ? ` ${count} memories` : ''}
                  </span>
                  <span className="ml-auto font-mono text-faint">{ago(e.createdAt)}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-mute">{eventText(e)}</p>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

// ------------------------------------------------------------------ drawer

export function Drawer(props: {
  readOnly?: boolean;
  id: string;
  version: number;
  timeWarp: number;
  onClose: () => void;
  onPick: (id: string) => void;
  onChanged: () => void;
}) {
  const [why, setWhy] = useState<WhyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api<WhyResult>(`/api/why?id=${encodeURIComponent(props.id)}`)
      .then((w) => alive && setWhy(w))
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [props.id, props.version]);

  const m = why?.memory;
  return (
    <aside className="glass animate-drawer-in pointer-events-auto flex max-h-full w-[22rem] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        {m ? (
          <span className="flex items-center gap-2 text-xs text-ink-2">
            <KindDot kind={m.kind} /> <span className="capitalize">{m.kind}</span> · {m.project}
          </span>
        ) : (
          <span className="text-xs text-mute">Loading…</span>
        )}
        <button onClick={props.onClose} className=" p-1 text-mute hover:bg-white/5 hover:text-ink" aria-label="Close">
          <X size={16} />
        </button>
      </div>
      {error && <p className="p-5 text-sm text-conflict">{error}</p>}
      {m && why && (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          <p className={`mt-4 font-serif text-[26px] leading-[1.15] ${m.status === 'active' ? 'text-ink' : 'text-mute line-through decoration-1'}`}>
            {m.content}
          </p>
          {m.status !== 'active' && (
            <Pill className="mt-3 border-[#96acd0]/30 text-[#96acd0]">
              <GitBranch size={11} /> {m.status}
            </Pill>
          )}

          <RetentionCurve memory={m} timeWarp={props.timeWarp} />

          <Section title="Provenance">
            <Row label="Stored by" value={m.agent} />
            <Row label="Session" value={<span className="font-mono">{m.sessionId.slice(0, 8)}</span>} />
            <Row label="When" value={new Date(m.createdAt).toLocaleString()} />
            <Row label="Recalled" value={`${m.recallCount}×`} />
            {m.excerpt && <blockquote className="mt-2 border-l border-amber/50 pl-3 text-xs italic leading-relaxed text-mute">“{m.excerpt}”</blockquote>}
          </Section>

          {(why.replaced.length > 0 || why.replacedBy.length > 0) && (
            <Section title="History">
              {why.replacedBy.map((x) => (
                <HistoryItem key={x.id} label="Replaced by" m={x} onPick={props.onPick} />
              ))}
              <div className="my-1 flex items-center gap-2 text-xs text-ink">
                <span className="h-1.5 w-1.5 bg-amber" /> this memory
              </div>
              {why.replaced.map((x) => (
                <HistoryItem
                  key={x.id}
                  label="Replaced"
                  m={x}
                  reason={why.links.find((l) => l.link.type === 'supersedes' && l.link.toId === x.id)?.link.reason}
                  onPick={props.onPick}
                />
              ))}
            </Section>
          )}

          {why.links.filter((l) => l.link.type !== 'supersedes').length > 0 && (
            <Section title="Connections">
              {why.links
                .filter((l) => l.link.type !== 'supersedes')
                .map(({ link, other }) => (
                  <button
                    key={link.id}
                    onClick={() => props.onPick(other.id)}
                    className="mb-1.5 block w-full border border-line p-2.5 text-left text-xs transition hover:border-line-2"
                  >
                    <span className={link.type === 'contradicts' && !link.resolved ? 'text-conflict' : 'text-ink-2'}>
                      {link.type}
                      {link.type === 'contradicts' && !link.resolved ? ' · open' : ''}
                    </span>
                    <span className="mt-0.5 block text-mute">{other.content}</span>
                  </button>
                ))}
            </Section>
          )}

          {m.status === 'active' && !props.readOnly && (
            <button
              onClick={async () => {
                await api('/api/forget', { body: { id: m.id } });
                props.onChanged();
                props.onClose();
              }}
              className="mt-6 inline-flex items-center gap-1.5 border border-line px-3 py-1.5 text-xs text-mute transition hover:border-conflict/40 hover:text-conflict"
            >
              <Trash2 size={12} /> Forget this
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

function HistoryItem({ label, m, reason, onPick }: { label: string; m: Memory; reason?: string; onPick: (id: string) => void }) {
  return (
    <button onClick={() => onPick(m.id)} className="group mb-1 flex w-full items-start gap-2 py-1 text-left text-xs">
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full border border-mute" />
      <span>
        <span className="text-faint">{label} · {new Date(m.createdAt).toLocaleDateString()}</span>
        <span className="block text-mute group-hover:text-ink">{m.content}</span>
        {reason && <span className="mt-0.5 block text-faint italic">{reason}</span>}
      </span>
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 border-t border-line pt-4">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-0.5 text-xs">
      <span className="text-mute">{label}</span>
      <span className="text-ink-2">{value}</span>
    </div>
  );
}

/** Retention now plus the projected forgetting curve for the next 90 days. */
function RetentionCurve({ memory, timeWarp }: { memory: Memory; timeWarp: number }) {
  const W = 300;
  const H = 70;
  const days = 90;
  const now = retentionAt(memory, 0, timeWarp);
  const pts = Array.from({ length: 61 }, (_, i) => {
    const d = (i / 60) * days;
    const r = retentionAt(memory, d, timeWarp);
    return `${(i / 60) * W},${H - r * (H - 4) - 2}`;
  }).join(' ');
  const fadeIn = daysUntilFaded(memory.stability, now);
  const thresholdY = H - FADED_THRESHOLD * (H - 4) - 2;
  return (
    <div className="mt-5 border border-line bg-white/[0.02] p-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="font-serif text-4xl leading-none text-amber">{pct(memory.status === 'active' ? now : 0)}</div>
          <div className="mt-1 text-[11px] text-mute">retention now</div>
        </div>
        <div className="text-right text-[11px] text-mute">
          <div>
            stability <span className="text-ink-2">{memory.stability.toFixed(1)}d</span>
          </div>
          <div className="flex items-center justify-end gap-1">
            <Clock size={10} /> {fadeIn > 365 ? 'fades in >1 year' : fadeIn <= 0 ? 'faded' : `fades in ${Math.round(fadeIn)}d`}
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="curve" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#d6b684" stopOpacity="0.28" />
            <stop offset="1" stopColor="#d6b684" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" x2={W} y1={thresholdY} y2={thresholdY} stroke="rgba(255,255,255,.14)" strokeDasharray="3 4" />
        <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#curve)" />
        <polyline points={pts} fill="none" stroke="#d6b684" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-faint">
        <span>today</span>
        <span>+90 days</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ conflicts

export function ConflictInbox({
  data,
  readOnly,
  onClose,
  onResolved,
}: {
  data: BrainData;
  readOnly?: boolean;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const resolve = async (linkId: string, keepId: string) => {
    setBusy(linkId);
    try {
      await api('/api/resolve', { body: { linkId, keepId } });
      onResolved();
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass w-full max-w-3xl p-6 sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-serif text-4xl leading-none">Your agent isn’t sure.</h2>
            <p className="mt-2 text-sm text-mute">
              These memories disagree and nothing says which is newer. Pick the truth; the other is superseded.
              {readOnly && ' (Read-only in the demo: in a real brain, you or your agent resolve this.)'}
            </p>
          </div>
          <button onClick={onClose} className=" p-1.5 text-mute hover:bg-white/5 hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {data.conflicts.length === 0 && (
          <p className="mt-8 flex items-center gap-2 text-sm text-ink-2">
            <Check size={16} className="text-[#96c2aa]" /> No open conflicts. Your agent’s memory is consistent.
          </p>
        )}
        <div className="mt-6 flex flex-col gap-6">
          {data.conflicts.map(({ link, a, b }) => (
            <div key={link.id}>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
                {[a, b].map((m, i) => (
                  <ConflictCard key={m.id} m={m} side={i} busy={busy === link.id} onKeep={readOnly ? undefined : () => resolve(link.id, m.id)} />
                )).flatMap((el, i) => (i === 0 ? [el, <div key="vs" className="hidden items-center font-serif text-2xl italic text-conflict sm:flex">vs</div>] : [el]))}
              </div>
              {link.reason && <p className="mt-2 text-xs text-mute">Why flagged: {link.reason}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConflictCard({ m, busy, onKeep }: { m: Memory; side: number; busy: boolean; onKeep?: () => void }) {
  return (
    <div className="flex flex-col border border-line bg-white/[0.02] p-4">
      <span className="flex items-center gap-2 text-[11px] text-mute">
        <KindDot kind={m.kind} size={6} /> {m.agent} · {new Date(m.createdAt).toLocaleDateString()}
      </span>
      <p className="mt-2 flex-1 font-serif text-xl leading-snug">{m.content}</p>
      <button
        disabled={busy || !onKeep}
        onClick={onKeep}
        title={onKeep ? undefined : 'Read-only demo: an agent or the owner resolves this'}
        className="mt-4 inline-flex w-fit items-center gap-1.5 bg-ink px-3.5 py-1.5 text-xs font-medium text-void transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Check size={13} /> Keep this
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ bottom

export function TimeWarp({ days, onChange, faded }: { days: number; onChange: (d: number) => void; faded: number }) {
  return (
    <div className="glass pointer-events-auto flex w-full max-w-lg items-center gap-4 px-5 py-2.5">
      <Clock size={14} className="shrink-0 text-amber" />
      <span className="shrink-0 font-mono text-[11px] text-mute">today</span>
      <input
        type="range"
        min={0}
        max={90}
        value={days}
        onChange={(e) => onChange(Number(e.target.value))}
        className="warp min-w-0 flex-1 focus:outline-none"
        style={{ ['--fill' as string]: `${(days / 90) * 100}%` }}
        aria-label="Time warp: project memory retention into the future"
      />
      <span className="w-28 shrink-0 text-right text-[11px] text-ink-2">
        {days === 0 ? 'drag to time-travel' : `+${days} days · ${faded} faded`}
      </span>
    </div>
  );
}

export function RecallResults({ hits, onPick, onClear }: { hits: RecallHit[]; onPick: (id: string) => void; onClear: () => void }) {
  return (
    <div className="glass animate-slide-in pointer-events-auto w-full max-w-xl p-2">
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">{hits.length} memories recalled</span>
        <button onClick={onClear} className="text-[11px] text-mute hover:text-ink">
          clear
        </button>
      </div>
      {hits.length === 0 && <p className="px-3 pb-2 text-sm text-mute">Nothing relevant yet.</p>}
      {hits.map((h) => (
        <button
          key={h.memory.id}
          onClick={() => onPick(h.memory.id)}
          className="flex w-full items-start gap-3 px-3 py-2 text-left transition hover:bg-white/[0.04]"
        >
          <KindDot kind={h.memory.kind} size={7} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm leading-snug text-ink">{h.memory.content}</span>
            {h.conflictsWith.map((c) => (
              <span key={c.id} className="mt-0.5 flex items-center gap-1 text-[11px] text-conflict">
                <Zap size={10} /> conflicts with “{c.content}”
              </span>
            ))}
          </span>
          <span className="shrink-0 text-right font-mono text-[10px] text-faint">
            {Math.round(h.score * 100)}
            <span className="block">{pct(h.retention)}</span>
          </span>
          <ArrowUpRight size={13} className="mt-0.5 shrink-0 text-faint" />
        </button>
      ))}
    </div>
  );
}

export function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 6000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="glass animate-slide-in pointer-events-auto max-w-xl whitespace-pre-line px-4 py-3 text-xs leading-relaxed text-ink-2">
      {text}
    </div>
  );
}
