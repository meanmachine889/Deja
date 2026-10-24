'use client';
// Floating Claude Code vignette for the hero: a fresh session that recalls the right database
// and cites why, synced to HeroSky's supersede loop.
import { useEffect, useState } from 'react';

const LINES: { at: number; node: React.ReactNode }[] = [
  {
    at: 0,
    node: (
      <>
        <span className="text-amber">›</span> add a migration for the orders table
      </>
    ),
  },
  {
    at: 700,
    node: (
      <>
        <span className="text-faint">●</span> deja · recall <span className="text-ink-2">“database we use”</span>
      </>
    ),
  },
  {
    at: 1500,
    node: (
      <span className="text-mute">
        1. <span className="text-ink">The team migrated from Postgres to MySQL on Appwrite</span> · 94%
      </span>
    ),
  },
  {
    at: 2100,
    node: <span className="pl-4 text-faint line-through decoration-faint/70">The app database is Postgres on Supabase</span>,
  },
  {
    at: 2900,
    node: (
      <>
        <span className="text-amber">✻</span> Using MySQL. You switched on Sep 24; I’ll write it with Drizzle like the others.
      </>
    ),
  },
];

export function Terminal() {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setT(99_999);
      return;
    }
    const start = performance.now();
    const id = setInterval(() => setT((performance.now() - start) % 7000), 100);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="glass w-full max-w-[25rem] overflow-hidden shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="h-2 w-2 bg-white/10" />
        <span className="h-2 w-2 bg-white/10" />
        <span className="h-2 w-2 bg-white/10" />
        <span className="ml-2 font-mono text-[11px] text-faint">claude-code · acme-shop</span>
        <span
          className={`ml-auto border px-2 py-0.5 font-mono text-[10px] transition-opacity duration-500 ${
            t > 2100 ? 'border-[#9fc2ff]/30 text-[#9fc2ff] opacity-100' : 'border-transparent opacity-0'
          }`}
        >
          1 superseded
        </span>
      </div>
      <div className="flex min-h-[10.5rem] flex-col gap-1.5 px-4 py-3.5 font-mono text-[11.5px] leading-relaxed text-ink-2">
        {LINES.map((l, i) => (
          <p key={i} className={`transition-all duration-500 ${t >= l.at ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'}`}>
            {l.node}
          </p>
        ))}
      </div>
    </div>
  );
}
