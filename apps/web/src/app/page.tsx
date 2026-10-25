import { ArrowRight, Database, Globe, KeyRound, Radio, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { CopyButton } from '@/components/landing/CopyButton';
import { FeatureGrid } from '@/components/landing/FeatureGrid';
import { HeroSky } from '@/components/landing/HeroSky';
import { Terminal } from '@/components/landing/Terminal';

// Landing page. One centred column framed by hairlines; every block is a cell on that grid.

const REPO = 'https://github.com/meanmachine889/deja';

function Cross({ className }: { className: string }) {
  return (
    <span aria-hidden className={`pointer-events-none absolute z-10 font-mono text-[13px] leading-none text-faint ${className}`}>
      +
    </span>
  );
}

/** A full-width row of the grid, with + marks where its top rule meets the frame. */
function Row({ children, className = '', id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`relative border-t border-line ${className}`}>
      <Cross className="-left-[4.5px] -top-[7px]" />
      <Cross className="-right-[4.5px] -top-[7px]" />
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">{children}</p>;
}

function SectionHead({ label, title, sub }: { label: string; title: React.ReactNode; sub?: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center sm:py-20">
      <Label>{label}</Label>
      <h2 className="mt-4 max-w-3xl font-serif text-[40px] leading-[1.05] tracking-[-0.01em] sm:text-[56px]">{title}</h2>
      {sub && <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-mute">{sub}</p>}
    </div>
  );
}

const STATS: { value: React.ReactNode; label: string; note: string }[] = [
  { value: '4', label: 'TablesDB tables', note: 'memories · links · events · sessions' },
  { value: '7', label: 'MCP tools', note: 'remember · recall · why · …' },
  { value: <>e<sup className="ml-0.5 align-super text-[0.45em] italic">−t/S</sup></>, label: 'forgetting curve', note: 'spaced-repetition stability' },
  { value: '1', label: 'memory for every agent', note: 'Claude Code, Cursor, Codex' },
];

const SERVICES = [
  { icon: Radio, name: 'Realtime', body: 'Every event row streams to the dashboard, filtered by row permissions.' },
  { icon: Sparkles, name: 'Embeddings', body: 'nomic-embed-text vectors generated inside Appwrite. No extra API.' },
  { icon: KeyRound, name: 'Auth', body: 'Each memory row is readable only by its owner’s account.' },
  { icon: Globe, name: 'Sites', body: 'The dashboard ships as a Next.js app on Appwrite Sites.' },
];

const STEPS = [
  { n: '01', title: 'Provision', body: 'Creates the TablesDB database, tables and indexes. Search runs on Appwrite too: no extra service.', cmd: 'pnpm setup:appwrite' },
  { n: '02', title: 'Connect your agent', body: 'Any MCP client works. This adds Déjà to Claude Code.', cmd: 'claude mcp add deja -- pnpm -s --dir ~/deja mcp' },
  { n: '03', title: 'Open the brain', body: 'Sign in and watch memories form while your agent works.', cmd: 'pnpm web' },
];

export default function Landing() {
  return (
    <div className="min-h-dvh bg-void px-4 sm:px-6">
      <div className="relative mx-auto max-w-[1200px] border-x border-line">
        {/* Nav: three equal cells */}
        <header className="sticky top-0 z-30 grid grid-cols-2 border-b border-line bg-void/85 backdrop-blur-md md:grid-cols-3">
          <Link href="/" className="flex h-14 items-center gap-2 px-5">
            <span className="h-2 w-2 rounded-full bg-amber" />
            <span className="font-serif text-2xl leading-none">déjà</span>
          </Link>
          <nav className="hidden h-14 items-center justify-center gap-8 border-x border-line text-[13px] text-mute md:flex">
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#databases" className="hover:text-ink">Storage</a>
            <a href="#install" className="hover:text-ink">Install</a>
          </nav>
          <div className="flex h-14 items-center justify-end gap-4 px-5">
            <a href={REPO} className="hidden text-[13px] text-mute hover:text-ink sm:block">
              GitHub
            </a>
            <Link href="/brain" className="inline-flex items-center gap-1.5 whitespace-nowrap bg-ink px-3.5 py-2 text-[13px] font-medium text-void transition hover:bg-white">
              Open the brain <ArrowRight size={13} />
            </Link>
          </div>
        </header>

        {/* Hero copy */}
        <section className="relative flex flex-col items-center px-6 pb-16 pt-20 text-center sm:pt-28">
          <span className="inline-flex items-center gap-2 border border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-2">
            <Database size={11} className="text-amber" /> Built on Appwrite TablesDB
          </span>
          <h1 className="mt-8 font-serif text-[52px] leading-[0.98] tracking-[-0.02em] sm:text-[84px] lg:text-[104px]">
            Your agents remember.
            <br />
            <span className="italic text-mute">And know when they’re wrong.</span>
          </h1>
          <p className="mt-7 max-w-xl text-[16px] leading-relaxed text-mute">
            Déjà is long-term memory for Claude Code, Cursor and any MCP agent. It supersedes stale facts, forgets noise on a
            human forgetting curve, and can always tell you why it knows what it knows.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/brain" className="inline-flex items-center gap-2 bg-amber px-5 py-3 text-sm font-medium text-void transition hover:brightness-110">
              See a live brain <ArrowRight size={15} />
            </Link>
            <a href="#install" className="inline-flex items-center gap-2 border border-line-2 px-5 py-3 text-sm text-ink-2 transition hover:border-ink-2 hover:text-ink">
              Install in a minute
            </a>
          </div>
        </section>

        {/* Hero visual: one wide cell, terminal dead centre, corner captions */}
        <Row>
          <div className="relative aspect-[4/5] overflow-hidden bg-[radial-gradient(80%_70%_at_50%_40%,#17161f_0%,#0b0b0d_75%)] sm:aspect-[2/1]">
            <HeroSky />
            <div className="absolute inset-0 flex items-center justify-center p-5">
              <Terminal />
            </div>
            <p className="absolute bottom-4 left-5 max-w-[11rem] text-[11px] leading-snug text-mute">Memories that get used grow brighter.</p>
            <p className="absolute bottom-4 right-5 max-w-[11rem] text-right text-[11px] leading-snug text-mute">Stale ones become rings, never lies.</p>
          </div>
        </Row>

        {/* Stats: four squares */}
        <Row>
          <div className="grid grid-cols-2 md:grid-cols-4">
            {STATS.map((s, i) => (
              <div
                key={s.label}
                className={`flex aspect-square flex-col justify-between p-5 sm:p-6 ${i % 2 === 0 ? 'border-r' : 'md:border-r'} ${i < 2 ? 'border-b md:border-b-0' : ''} ${i === 3 ? 'md:border-r-0' : ''} border-line`}
              >
                <Label>{String(i + 1).padStart(2, '0')}</Label>
                <div>
                  <p className="font-serif text-[44px] leading-none text-ink sm:text-[64px]">{s.value}</p>
                  <p className="mt-3 text-sm text-ink-2">{s.label}</p>
                  <p className="mt-1 text-xs text-faint">{s.note}</p>
                </div>
              </div>
            ))}
          </div>
        </Row>

        {/* Features */}
        <Row id="how">
          <SectionHead
            label="How it works"
            title={
              <>
                Most memory layers only add.
                <br />
                <span className="italic text-mute">Déjà also revises.</span>
              </>
            }
            sub="An append-only vector store remembers everything forever, including what stopped being true. Déjà treats memory like a brain does."
          />
        </Row>
        <Row>
          <FeatureGrid />
        </Row>

        {/* Databases */}
        <Row id="databases">
          <SectionHead
            label="Where memory lives"
            title={
              <>
                Vectors answer <span className="italic">what</span>.
                <br />
                <span className="text-mute">TablesDB answers whether it’s still true.</span>
              </>
            }
            sub="Similarity alone can’t tell you a fact went stale. Everything that makes Déjà more than a vector dump lives in Appwrite TablesDB."
          />
        </Row>
        <Row>
          <div className="grid grid-cols-1 md:grid-cols-2">
            <DbCell
              label="Appwrite TablesDB"
              question="Is it still true? Where did it come from?"
              body="Status, stability and recall counts, the knowledge graph of supersedes and contradicts links, sessions, and the append-only event log that Realtime streams. Row-level permissions keep each brain private."
              className="border-b border-line md:border-b-0 md:border-r"
            >
              <TableViz />
            </DbCell>
            <DbCell
              label="Vector search"
              question="What is this about?"
              body="Appwrite Embeddings turns each memory into a 768-d vector, ranked by cosine similarity over your TablesDB rows. One env var swaps in Qdrant or Appwrite VectorsDB for HNSW at scale."
            >
              <VectorViz />
            </DbCell>
          </div>
        </Row>
        <Row>
          <div className="grid grid-cols-2 md:grid-cols-4">
            {SERVICES.map((s, i) => (
              <div
                key={s.name}
                className={`flex aspect-square flex-col justify-between border-line p-5 sm:p-6 ${i % 2 === 0 ? 'border-r' : 'md:border-r'} ${i < 2 ? 'border-b md:border-b-0' : ''} ${i === 3 ? 'md:border-r-0' : ''}`}
              >
                <s.icon size={18} className="text-amber" />
                <div>
                  <p className="font-serif text-2xl text-ink">{s.name}</p>
                  <p className="mt-2 text-xs leading-relaxed text-mute">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </Row>

        {/* Install */}
        <Row id="install">
          <SectionHead label="Install" title="Three commands." sub="Clone the repo, fill .env with your Appwrite project, then:" />
        </Row>
        <Row>
          <div className="grid grid-cols-1 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.n} className={`flex flex-col justify-between gap-8 border-line p-6 md:aspect-square ${i < 2 ? 'border-b md:border-b-0 md:border-r' : ''}`}>
                <div>
                  <p className="font-mono text-xs text-amber">{s.n}</p>
                  <p className="mt-4 font-serif text-3xl">{s.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-mute">{s.body}</p>
                </div>
                <div className="flex items-center justify-between gap-3 border border-line bg-black/30 px-3 py-2.5 font-mono text-[11.5px] text-ink-2">
                  <span className="overflow-x-auto whitespace-nowrap">
                    <span className="text-faint">$ </span>
                    {s.cmd}
                  </span>
                  <CopyButton text={s.cmd} />
                </div>
              </div>
            ))}
          </div>
        </Row>

        {/* Footer: wordmark centred, captions in the corners */}
        <Row>
          <div className="relative flex flex-col items-center overflow-hidden px-6 pb-20 pt-16">
            <p className="select-none font-serif text-[30vw] leading-[0.8] tracking-[-0.04em] text-ink/90 lg:text-[340px]">déjà</p>
            <Link href="/brain" className="mt-10 inline-flex items-center gap-2 bg-amber px-5 py-3 text-sm font-medium text-void transition hover:brightness-110">
              See a live brain <ArrowRight size={15} />
            </Link>
            <p className="absolute bottom-5 left-5 text-[11px] text-faint">Built solo for the Appwrite Databases Hackathon · Oct 2026</p>
            <a href={REPO} className="absolute bottom-5 right-5 text-[11px] text-faint hover:text-ink">
              github.com/meanmachine889/deja
            </a>
          </div>
        </Row>
        <div className="relative border-t border-line">
          <Cross className="-left-[4.5px] -top-[7px]" />
          <Cross className="-right-[4.5px] -top-[7px]" />
        </div>
      </div>
    </div>
  );
}

function DbCell(props: { label: string; question: string; body: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col md:aspect-square ${props.className ?? ''}`}>
      <div className="flex items-center justify-between px-6 pt-5">
        <Label>{props.label}</Label>
        <Database size={13} className="text-faint" />
      </div>
      <div className="relative flex min-h-[16rem] flex-1 items-center justify-center overflow-hidden px-6 py-8">
        <div className="dot-grid absolute inset-0 opacity-50" />
        <div className="relative w-full">{props.children}</div>
      </div>
      {/* Fixed height so neighbouring squares keep their rules aligned. */}
      <div className="border-t border-line px-6 py-5 md:h-44">
        <p className="font-serif text-[28px] leading-tight">{props.question}</p>
        <p className="mt-2 text-sm leading-relaxed text-mute">{props.body}</p>
      </div>
    </div>
  );
}

function VectorViz() {
  // Query vector in the middle; nearest memories ringed by cosine distance.
  const pts = [
    [30, 34, 0.12, true],
    [62, 28, 0.18, true],
    [40, 68, 0.21, true],
    [78, 60, 0.47, false],
    [18, 58, 0.52, false],
    [70, 82, 0.61, false],
    [86, 22, 0.66, false],
    [14, 18, 0.72, false],
  ] as const;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[17rem]">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        {[18, 32, 46].map((r) => (
          <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeDasharray="1 1.5" strokeWidth="0.4" />
        ))}
        {pts.filter((p) => p[3]).map(([x, y]) => (
          <line key={`${x}${y}`} x1="50" y1="50" x2={x} y2={y} stroke="rgba(214,182,132,.5)" strokeWidth="0.4" />
        ))}
        {pts.map(([x, y, , near]) => (
          <circle key={`p${x}${y}`} cx={x} cy={y} r={near ? 1.8 : 1.2} fill={near ? '#f2ede6' : 'rgba(232,228,220,.35)'} />
        ))}
        <rect x="47.5" y="47.5" width="5" height="5" fill="#d6b684" />
      </svg>
      <span className="absolute left-1/2 top-[57%] -translate-x-1/2 whitespace-nowrap font-mono text-[9px] text-amber">
        “which database?”
      </span>
      <span className="absolute left-[24%] top-[26%] font-mono text-[9px] text-ink-2">0.12</span>
      <span className="absolute left-[63%] top-[20%] font-mono text-[9px] text-ink-2">0.18</span>
      <span className="absolute left-[33%] top-[74%] font-mono text-[9px] text-ink-2">0.21</span>
    </div>
  );
}

function TableViz() {
  const rows = [
    ['Postgres on Supabase', 'superseded', '0.31', '0×'],
    ['Migrated to MySQL', 'active', '0.94', '5×'],
    ['pnpm workspaces', 'active', '0.98', '9×'],
    ['Staging rebooted', 'active', '0.04', '0×'],
  ];
  return (
    <div className="mx-auto w-full max-w-md border border-line bg-black/30 font-mono text-[10.5px]">
      <div className="grid grid-cols-[1.6fr_1fr_0.6fr_0.5fr] border-b border-line px-3 py-2 text-faint">
        <span>content</span>
        <span>status</span>
        <span>R</span>
        <span>recalls</span>
      </div>
      {rows.map(([c, st, r, n]) => (
        <div key={c} className="grid grid-cols-[1.6fr_1fr_0.6fr_0.5fr] border-b border-line px-3 py-2 last:border-b-0">
          <span className={`truncate ${st === 'superseded' ? 'text-faint line-through' : 'text-ink-2'}`}>{c}</span>
          <span className={st === 'superseded' ? 'text-[#96acd0]' : 'text-mute'}>{st}</span>
          <span className={Number(r) < 0.15 ? 'text-faint' : 'text-amber'}>{r}</span>
          <span className="text-mute">{n}</span>
        </div>
      ))}
      <div className="border-t border-line px-3 py-2 text-faint">
        links: <span className="text-ink-2">supersedes</span> · <span className="text-conflict">contradicts</span> · supports
      </div>
    </div>
  );
}
