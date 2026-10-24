'use client';
// The four pillars as a 2×2 grid of square cells: number, vignette, then title and copy below.
import { GitBranch, Zap } from 'lucide-react';

const FEATURES = [
  {
    n: '1.0',
    title: 'It notices when it’s wrong',
    tag: 'contradictions',
    body: 'New memories are checked against old ones. A change supersedes the stale fact and keeps the history; a real disagreement becomes a one-click conflict.',
    vignette: <Supersede />,
  },
  {
    n: '1.1',
    title: 'It forgets like a human',
    tag: 'forgetting curve',
    body: 'Every memory decays on a forgetting curve. What agents keep using gets stronger; one-off noise fades, so recall fills context with what matters.',
    vignette: <Curves />,
  },
  {
    n: '1.2',
    title: 'It can explain itself',
    tag: 'provenance',
    body: 'Every memory knows which agent stored it, in which session, the exact words it came from, and what it replaced. Ask why, get a real answer.',
    vignette: <Why />,
  },
  {
    n: '1.3',
    title: 'You can watch it think',
    tag: 'realtime',
    body: 'Your agent’s mind as a night sky. Stars ignite when stored, flare when recalled, dim as they fade. Drag time forward to see what it will forget.',
    vignette: <Sky />,
  },
];

export function FeatureGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2">
      {FEATURES.map((f, i) => (
        <article
          key={f.n}
          className={`relative flex flex-col border-line md:aspect-square ${i % 2 === 0 ? 'md:border-r' : ''} ${i < 2 ? 'border-b' : i === 2 ? 'border-b md:border-b-0' : ''}`}
        >
          <div className="flex items-center justify-between px-6 pt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
            <span className="text-amber">{f.n}</span>
            <span>{f.tag}</span>
          </div>
          <div className="relative flex min-h-[20rem] flex-1 items-center justify-center overflow-hidden px-6 py-8">
            <div className="dot-grid absolute inset-0 opacity-50" />
            <div className="relative w-full">{f.vignette}</div>
          </div>
          <div className="border-t border-line px-6 py-5">
            <h3 className="font-serif text-[28px] leading-tight text-ink">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-mute">{f.body}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ vignettes

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`glass p-4 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)] ${className}`}>{children}</div>;
}

function Supersede() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-2.5">
      <Card className="opacity-70">
        <p className="font-mono text-[10px] text-faint">claude-code · Sep 2</p>
        <p className="mt-1 font-serif text-lg text-mute line-through decoration-1">The app database is Postgres on Supabase</p>
      </Card>
      <div className="flex items-center gap-2 pl-4 text-[11px] text-[#9fc2ff]">
        <GitBranch size={12} /> superseded · “the newer memory describes a migration”
      </div>
      <Card>
        <p className="font-mono text-[10px] text-faint">claude-code · Sep 24</p>
        <p className="mt-1 font-serif text-lg text-ink">The team migrated the app database from Postgres to MySQL on Appwrite</p>
      </Card>
      <Card className="mt-2 border-conflict/25">
        <p className="flex items-center gap-1.5 text-[11px] text-conflict">
          <Zap size={11} /> open conflict
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-ink-2">
          <p className="border border-line p-2">Deploys happen on Fridays after the demo</p>
          <p className="border border-line p-2">Deploys are frozen on Fridays</p>
        </div>
        <div className="mt-2 flex gap-2">
          <span className="bg-ink px-2.5 py-1 text-[10px] font-medium text-void">Keep this</span>
          <span className="border border-line px-2.5 py-1 text-[10px] text-mute">Keep this</span>
        </div>
      </Card>
    </div>
  );
}

function Curves() {
  // A one-off event decays; a convention is recalled four times and keeps getting stronger.
  const W = 420;
  const H = 180;
    // Rounded so server and browser render identical strings (Math.exp differs in the last digits).
  const pt = (x: number, y: number) => `${x.toFixed(1)},${y.toFixed(1)}`;
  const decay = Array.from({ length: 61 }, (_, i) => pt((i / 60) * W, H - Math.exp(-i / 6) * (H - 20) - 10)).join(' ');
  const recalls = [0, 9, 22, 38];
  let s = 10;
  let last = 0;
  const pts: string[] = [];
  for (let i = 0; i <= 60; i++) {
    if (recalls.includes(i) && i > 0) {
      s = s * (1 + 1.5 * (1 - Math.exp(-(i - last) / s))) + 0.5;
      last = i;
    }
    const r = Math.exp(-(i - last) / s);
    pts.push(pt((i / 60) * W, H - r * (H - 20) - 10));
  }
  const fadedY = H - 0.15 * (H - 20) - 10;
  return (
    <Card className="mx-auto w-full max-w-md">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-mono uppercase tracking-[0.14em] text-faint">retention · 60 days</span>
        <span className="flex gap-3">
          <span className="flex items-center gap-1.5 text-ink-2">
            <span className="h-1.5 w-4 rounded-full bg-amber" /> recalled 3×
          </span>
          <span className="flex items-center gap-1.5 text-mute">
            <span className="h-1.5 w-4 rounded-full bg-[#b9b3a8]/60" /> one-off event
          </span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" aria-label="Forgetting curves">
        <line x1="0" x2={W} y1={fadedY} y2={fadedY} stroke="rgba(255,255,255,.14)" strokeDasharray="3 4" />
        <text x={W - 4} y={fadedY - 6} textAnchor="end" className="fill-[#5a5852] font-mono text-[10px]">
          faded
        </text>
        <polyline points={decay} fill="none" stroke="rgba(185,179,168,.6)" strokeWidth="1.5" />
        <polyline points={pts.join(' ')} fill="none" stroke="#f5b55b" strokeWidth="2" />
        {recalls.slice(1).map((d) => (
          <circle key={d} cx={(d / 60) * W} cy={10} r="3.5" fill="#f5b55b" />
        ))}
      </svg>
      <p className="mt-3 text-xs text-mute">
        Stability grows most when a memory is recalled right before it would fade, the same trick as spaced repetition.
      </p>
    </Card>
  );
}

function Why() {
  return (
    <Card className="mx-auto w-full max-w-md font-mono text-[11.5px] leading-relaxed">
      <p>
        <span className="text-amber">›</span> <span className="text-ink-2">why do you think we use MySQL?</span>
      </p>
      <p className="mt-2 text-faint">● deja · why 3f9c…</p>
      <div className="mt-2 space-y-1 text-mute">
        <p className="text-ink">“The team migrated the app database from Postgres to MySQL on Appwrite”</p>
        <p>status active · retention 94% · recalled 5×</p>
        <p>stored by claude-code · session 7a1e02c4 · Sep 24</p>
        <p className="border-l border-amber/50 pl-2 italic">“we finally moved off Supabase, everything’s on Appwrite MySQL now”</p>
        <p>replaced: “The app database is Postgres on Supabase” (Sep 2)</p>
      </div>
    </Card>
  );
}

function Sky() {
  const stars = [
    [18, 30, 5, '#a8e2c0'],
    [27, 22, 3.5, '#a8e2c0'],
    [24, 42, 4, '#a8e2c0'],
    [52, 18, 4.5, '#f2ede6'],
    [60, 30, 3, '#f2ede6'],
    [78, 36, 5, '#9fc2ff'],
    [86, 50, 3.5, '#9fc2ff'],
    [38, 66, 4, '#f5b55b'],
    [46, 74, 3, '#f5b55b'],
    [70, 72, 4, '#e7b3df'],
  ] as const;
  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-md">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        <line x1="78" y1="36" x2="86" y2="50" stroke="#ff7a6b" strokeWidth="0.35" opacity="0.8" />
        <line x1="52" y1="18" x2="60" y2="30" stroke="rgba(242,237,230,.3)" strokeWidth="0.25" strokeDasharray="1 1.2" />
      </svg>
      {stars.map(([x, y, r, c], i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{ left: `${x}%`, top: `${y}%`, width: r * 2, height: r * 2, background: c, boxShadow: `0 0 ${r * 5}px ${r}px ${c}55`, transform: 'translate(-50%,-50%)' }}
        />
      ))}
      <span className="absolute left-[38%] top-[66%] h-10 w-10 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border border-amber/60" />
      <div className="glass absolute right-0 top-0 w-44 p-3 text-[11px]">
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">live</p>
        <p className="mt-1.5 text-ink-2">
          cursor <span className="text-amber">recalled</span>
        </p>
        <p className="text-mute">“small pull requests”</p>
        <p className="mt-1.5 text-ink-2">
          claude-code <span className="text-[#9fc2ff]">superseded</span>
        </p>
        <p className="text-mute">Vercel → Appwrite Sites</p>
      </div>
      <div className="glass absolute bottom-0 left-1/2 flex w-60 -translate-x-1/2 items-center gap-2 px-3 py-2 text-[10px] text-mute">
        today
        <span className="relative h-0.5 flex-1 rounded bg-white/15">
          <span className="absolute inset-y-0 left-0 w-2/3 rounded bg-amber" />
          <span className="absolute -top-1.5 left-2/3 h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-ink shadow-[0_0_12px_#f5b55b]" />
        </span>
        +60d
      </div>
    </div>
  );
}
