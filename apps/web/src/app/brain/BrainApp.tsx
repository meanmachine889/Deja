'use client';
import type { RecallHit } from '@deja/core';
import { FADED_THRESHOLD } from '@deja/core/decay';
import type { Kind } from '@deja/core/types';
import { LogOut, Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Constellation, retentionAt } from '@/components/Constellation';
import { AskBar, ConflictInbox, Drawer, Feed, RecallResults, StatsPanel, TimeWarp, Toast } from '@/components/panels';
import { account, api, clearJwt, OFFLINE, subscribeEvents } from '@/lib/browser';
import type { BrainData } from '@/lib/types';

export function BrainApp() {
  const router = useRouter();
  const [data, setData] = useState<BrainData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState('all');
  const [warpDays, setWarpDays] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [hits, setHits] = useState<RecallHit[] | null>(null);
  const [hiddenKinds, setHiddenKinds] = useState<Set<Kind>>(new Set());
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const flares = useRef(new Map<string, number>());
  const seenEvents = useRef<Set<string> | null>(null);
  // The top bar wraps to several rows on narrow screens; keep the sky below its last row (the pill
  // cluster), ignoring the recall dropdown so opening results doesn't squash the sky.
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(88);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderH(el.getBoundingClientRect().bottom + 12));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const load = useCallback(async () => {
    try {
      const next = await api<BrainData>('/api/brain');
      // Flare every memory touched by an event we haven't seen yet.
      if (seenEvents.current) {
        const newOnes = next.events.filter((e) => !seenEvents.current!.has(e.id));
        const t = performance.now();
        newOnes.forEach((e, i) => e.memoryId && flares.current.set(e.memoryId, t + i * 120));
        if (newOnes.length) setFresh(new Set(newOnes.map((e) => e.id)));
      }
      seenEvents.current = new Set(next.events.map((e) => e.id));
      setData(next);
      setVersion((v) => v + 1);
      setError(null);
    } catch (err) {
      const message = (err as Error).message;
      if (/sign in|session/i.test(message)) router.replace('/login');
      else setError(message);
    }
  }, [router]);

  // Auth gate (live only), first load, then Realtime (live) or polling (offline).
  useEffect(() => {
    let stop = () => {};
    let timer: ReturnType<typeof setInterval> | undefined;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      if (!OFFLINE) {
        try {
          await account().get();
        } catch {
          router.replace('/login');
          return;
        }
      }
      await load();
      if (OFFLINE) timer = setInterval(load, 3000);
      else
        stop = await subscribeEvents((row) => {
          if (typeof row.memoryId === 'string') flares.current.set(row.memoryId, performance.now());
          clearTimeout(debounce);
          debounce = setTimeout(load, 250);
        });
    })();
    return () => {
      stop();
      clearInterval(timer);
      clearTimeout(debounce);
    };
  }, [load, router]);

  const projects = useMemo(() => [...new Set(data?.memories.map((m) => m.project) ?? [])].sort(), [data]);
  const inProject = useCallback((p: string) => project === 'all' || p === project || p === 'global', [project]);
  const memories = useMemo(() => (data?.memories ?? []).filter((m) => inProject(m.project)), [data, inProject]);
  const ids = useMemo(() => new Set(memories.map((m) => m.id)), [memories]);
  const links = useMemo(() => (data?.links ?? []).filter((l) => ids.has(l.fromId) && ids.has(l.toId)), [data, ids]);
  const events = useMemo(() => (data?.events ?? []).filter((e) => inProject(e.project) || e.project === ''), [data, inProject]);
  const conflicts = useMemo(() => (data?.conflicts ?? []).filter((c) => inProject(c.a.project)), [data, inProject]);
  const highlightIds = useMemo(() => new Set(hits?.map((h) => h.memory.id) ?? []), [hits]);
  const fadedAtWarp = useMemo(
    () => memories.filter((m) => m.status === 'active' && retentionAt(m, warpDays, data?.timeWarp ?? 1) < FADED_THRESHOLD).length,
    [memories, warpDays, data?.timeWarp],
  );

  const toggleKind = (k: Kind) =>
    setHiddenKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-void">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 45%, rgba(245,181,91,0.05), transparent 70%)' }}
      />
      {data && (
        <Constellation
          memories={memories}
          links={links}
          warpDays={warpDays}
          timeWarp={data.timeWarp}
          selectedId={selected}
          highlightIds={highlightIds}
          labelId={hits?.[0]?.memory.id ?? null}
          flares={flares.current}
          hiddenKinds={hiddenKinds}
          onSelect={setSelected}
          insets={{ top: headerH, bottom: 76, left: 272, right: selected ? 380 : 304 }}
        />
      )}

      {/* Top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-3 p-4 lg:flex-row lg:items-start lg:justify-between">
        <Link href="/" className="glass pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2">
          <span className="h-2 w-2 rounded-full bg-amber shadow-[0_0_12px_#f5b55b]" />
          <span className="font-serif text-xl leading-none">déjà</span>
        </Link>
        <div className="pointer-events-auto flex w-full max-w-xl flex-col items-center gap-2">
          <AskBar
            project={project}
            onResults={(h) => {
              setHits(h);
              setSelected(null);
              const t = performance.now();
              h.forEach((x, i) => flares.current.set(x.memory.id, t + i * 90));
            }}
            onTaught={(res) => {
              setToast(res.summary);
              load();
            }}
          />
          {hits && <RecallResults hits={hits} onPick={setSelected} onClear={() => setHits(null)} />}
          {toast && <Toast text={toast} onDone={() => setToast(null)} />}
        </div>
        <div ref={headerRef} className="glass pointer-events-auto flex items-center gap-1 rounded-full p-1">
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            className="rounded-full bg-transparent px-3 py-1.5 text-xs text-ink-2 focus:outline-none"
            aria-label="Project"
          >
            <option value="all">All projects</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            onClick={() => setConflictsOpen(true)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${conflicts.length ? 'bg-conflict/15 text-conflict' : 'text-mute hover:text-ink'}`}
          >
            <Zap size={12} /> {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'}
          </button>
          {!OFFLINE && (
            <button
              onClick={async () => {
                await account().deleteSession({ sessionId: 'current' }).catch(() => {});
                clearJwt();
                router.replace('/login');
              }}
              className="rounded-full p-2 text-mute hover:text-ink"
              aria-label="Sign out"
            >
              <LogOut size={13} />
            </button>
          )}
        </div>
      </header>

      {/* Side rails */}
      {data && (
        <div className="pointer-events-none absolute inset-x-0 bottom-20 top-24 z-10 hidden justify-between px-4 md:flex">
          <div className="flex flex-col justify-start">
            <StatsPanel
              memories={memories}
              conflicts={conflicts.length}
              warpDays={warpDays}
              timeWarp={data.timeWarp}
              sessions={data.sessions}
              hiddenKinds={hiddenKinds}
              toggleKind={toggleKind}
            />
          </div>
          <div className="flex min-h-0 flex-col justify-start">
            {selected ? (
              <Drawer
                id={selected}
                version={version}
                timeWarp={data.timeWarp}
                onClose={() => setSelected(null)}
                onPick={setSelected}
                onChanged={load}
              />
            ) : (
              <Feed events={events} fresh={fresh} onPick={setSelected} />
            )}
          </div>
        </div>
      )}

      {/* Mobile drawer */}
      {data && selected && (
        <div className="absolute inset-x-4 bottom-20 top-40 z-30 flex md:hidden">
          <Drawer id={selected} version={version} timeWarp={data.timeWarp} onClose={() => setSelected(null)} onPick={setSelected} onChanged={load} />
        </div>
      )}

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-4">
        <TimeWarp days={warpDays} onChange={setWarpDays} faded={fadedAtWarp} />
      </footer>

      {!data && !error && (
        <div className="absolute inset-0 flex items-center justify-center font-serif text-2xl italic text-mute">waking up…</div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-conflict">{error}</div>
      )}
      {data && OFFLINE && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap font-mono md:block text-[10px] uppercase tracking-[0.14em] text-faint">
          offline demo brain · connect Appwrite for realtime
        </div>
      )}
      {conflictsOpen && data && (
        <ConflictInbox
          data={{ ...data, conflicts }}
          onClose={() => setConflictsOpen(false)}
          onResolved={() => {
            load();
          }}
        />
      )}
    </main>
  );
}
