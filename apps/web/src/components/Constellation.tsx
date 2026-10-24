'use client';
// The brain as a night sky. Each memory is a star: size = how often it's been recalled,
// brightness = retention on the forgetting curve, tint = kind. Threads are the knowledge graph.
import { elapsedDays, FADED_THRESHOLD } from '@deja/core/decay';
import type { Kind, Link, Memory } from '@deja/core/types';
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { useEffect, useRef } from 'react';

// Muted, chart-like tints: kind is legible without anything glowing.
export const KIND_RGB: Record<Kind, [number, number, number]> = {
  fact: [232, 228, 220],
  preference: [214, 182, 132],
  decision: [150, 172, 208],
  convention: [150, 194, 170],
  person: [196, 166, 190],
  event: [150, 145, 137],
};
const KIND_ORDER: Kind[] = ['convention', 'decision', 'fact', 'person', 'event', 'preference'];

type Node = SimulationNodeDatum & { id: string; m: Memory; r: number };
type Edge = SimulationLinkDatum<Node> & { type: Link['type']; resolved: boolean };

export interface ConstellationProps {
  memories: Memory[];
  links: Link[];
  /** Days to project forward on the forgetting curve (time-warp slider). */
  warpDays: number;
  timeWarp: number;
  selectedId: string | null;
  highlightIds: Set<string>;
  /** The single highlighted star that also gets a label (e.g. the top recall hit). */
  labelId?: string | null;
  /** memoryId -> performance.now() when it last flared. */
  flares: Map<string, number>;
  hiddenKinds: Set<Kind>;
  onSelect: (id: string | null) => void;
  /** Screen pixels covered by overlay panels on each side (left/right ignored below 768px). */
  insets?: { top: number; right: number; bottom: number; left: number };
}

export function retentionAt(m: Memory, warpDays: number, timeWarp: number, now = new Date()) {
  return Math.exp(-(elapsedDays(m.lastReinforcedAt, now, timeWarp) + warpDays) / m.stability);
}

function anchor(kind: Kind) {
  const i = KIND_ORDER.indexOf(kind);
  const a = (i / KIND_ORDER.length) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.cos(a) * 140, y: Math.sin(a) * 95 };
}

const radiusFor = (m: Memory) => 2.2 + 1.3 * Math.log2(m.recallCount + 2);

export function Constellation(props: ConstellationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const nodesRef = useRef(new Map<string, Node>());
  const edgesRef = useRef<Edge[]>([]);
  const simRef = useRef<Simulation<Node, Edge> | null>(null);
  const viewRef = useRef({ x: 0, y: 0, k: 1 });
  const hoverRef = useRef<string | null>(null);

  // Rebuild the simulation graph when the set of memories or links changes.
  useEffect(() => {
    const prev = nodesRef.current;
    const next = new Map<string, Node>();
    for (const m of props.memories) {
      const old = prev.get(m.id);
      if (old) {
        old.m = m;
        old.r = radiusFor(m);
        next.set(m.id, old);
      } else {
        const linked = props.links.find((l) => l.fromId === m.id || l.toId === m.id);
        const near = linked && prev.get(linked.fromId === m.id ? linked.toId : linked.fromId);
        const base = near ?? anchor(m.kind);
        next.set(m.id, {
          id: m.id,
          m,
          r: radiusFor(m),
          x: (base.x ?? 0) + (Math.random() - 0.5) * 40,
          y: (base.y ?? 0) + (Math.random() - 0.5) * 40,
        });
      }
    }
    nodesRef.current = next;
    edgesRef.current = props.links
      .filter((l) => next.has(l.fromId) && next.has(l.toId))
      .map((l) => ({ source: l.fromId, target: l.toId, type: l.type, resolved: l.resolved }));

    const nodes = [...next.values()];
    if (!simRef.current) {
      simRef.current = forceSimulation<Node, Edge>()
        .force('charge', forceManyBody<Node>().strength(-26))
        .force('collide', forceCollide<Node>().radius((n) => n.r + 7))
        .force('x', forceX<Node>((n) => anchor(n.m.kind).x).strength(0.06))
        .force('y', forceY<Node>((n) => anchor(n.m.kind).y).strength(0.06))
        .alphaDecay(0.02);
    }
    const sim = simRef.current;
    sim.nodes(nodes);
    sim.force(
      'link',
      forceLink<Node, Edge>(edgesRef.current)
        .id((n) => n.id)
        .distance((e) => (e.type === 'supersedes' ? 34 : e.type === 'contradicts' ? 70 : 48))
        .strength((e) => (e.type === 'related' ? 0.05 : 0.25)),
    );
    sim.alpha(prev.size === 0 ? 1 : 0.35).restart();
  }, [props.memories, props.links]);

  // Render loop.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let dust: HTMLCanvasElement | null = null;
    let size = { w: 0, h: 0, dpr: 1 };
    // Canvas can't resolve CSS variables, so read next/font's generated family name once.
    // A negative radius throws and would kill the render loop.
    const circle = (x: number, y: number, r: number) => ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
    const family = getComputedStyle(document.documentElement).getPropertyValue('--font-inter').trim() || 'system-ui';

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = { w: rect.width, h: rect.height, dpr };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      dust = document.createElement('canvas');
      dust.width = canvas.width;
      dust.height = canvas.height;
      const d = dust.getContext('2d')!;
      const count = Math.round((rect.width * rect.height) / 4200);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * 0.16 + 0.02;
        d.fillStyle = `rgba(232,228,220,${a})`;
        d.beginPath();
        d.arc(Math.random() * dust.width, Math.random() * dust.height, (Math.random() * 0.6 + 0.25) * dpr, 0, Math.PI * 2);
        d.fill();
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    /** Area not covered by floating panels; the sky is fitted into it. */
    const safeArea = () => {
      const { w, h } = size;
      const i = propsRef.current.insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
      const wide = w >= 768;
      const left = wide ? i.left : 0;
      const right = wide ? i.right : 0;
      return { left, right, top: i.top, bottom: i.bottom, cx: left + (w - left - right) / 2, cy: i.top + (h - i.top - i.bottom) / 2 };
    };
    const toScreen = (x: number, y: number) => {
      const v = viewRef.current;
      const a = safeArea();
      return { x: a.cx + (x - v.x) * v.k, y: a.cy + (y - v.y) * v.k };
    };

    const draw = (t: number) => {
      const p = propsRef.current;
      const { w, h, dpr } = size;
      const nodes = [...nodesRef.current.values()];
      const now = new Date();
      const area = safeArea();

      // Ease the camera so every star fits the clear area. Stars keep a constant screen size.
      if (nodes.length) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const n of nodes) {
          minX = Math.min(minX, n.x!); maxX = Math.max(maxX, n.x!);
          minY = Math.min(minY, n.y!); maxY = Math.max(maxY, n.y!);
        }
        const availW = Math.max(120, w - area.left - area.right - 120);
        const availH = Math.max(120, h - area.top - area.bottom - 100);
        const k = Math.min(availW / Math.max(1, maxX - minX), availH / Math.max(1, maxY - minY), 3.4);
        const v = viewRef.current;
        v.k += (Math.max(0.35, k) - v.k) * 0.06;
        v.x += ((minX + maxX) / 2 - v.x) * 0.06;
        v.y += ((minY + maxY) / 2 - v.y) * 0.06;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (dust) ctx.drawImage(dust, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const visible = (n: Node) => !p.hiddenKinds.has(n.m.kind);
      const focus = p.selectedId ?? hoverRef.current;
      const pos = new Map<string, { x: number; y: number }>();
      for (const n of nodes) pos.set(n.id, toScreen(n.x!, n.y!));

      // Chart grid: faint rings and axes around the sky's centre, like a star atlas.
      ctx.strokeStyle = 'rgba(232,228,220,0.045)';
      ctx.lineWidth = 1;
      const maxR = Math.min(w - area.left - area.right, h - area.top - area.bottom) * 0.48;
      for (const f of [0.33, 0.66, 1]) {
        ctx.beginPath();
        circle(area.cx, area.cy, maxR * f);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(area.cx - maxR, area.cy);
      ctx.lineTo(area.cx + maxR, area.cy);
      ctx.moveTo(area.cx, area.cy - maxR);
      ctx.lineTo(area.cx, area.cy + maxR);
      ctx.stroke();

      // Threads: hairlines. Supersedes dashed, open contradictions a steady muted red.
      for (const e of edgesRef.current) {
        const s = e.source as Node;
        const d = e.target as Node;
        if (!visible(s) || !visible(d)) continue;
        const a = pos.get(s.id)!;
        const b = pos.get(d.id)!;
        const touchesFocus = focus && (s.id === focus || d.id === focus);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.setLineDash([]);
        ctx.lineWidth = touchesFocus ? 1 : 0.75;
        if (e.type === 'contradicts' && !e.resolved) {
          ctx.strokeStyle = `rgba(214,120,106,${touchesFocus ? 0.9 : 0.6})`;
        } else if (e.type === 'supersedes') {
          ctx.setLineDash([2, 3]);
          ctx.strokeStyle = `rgba(232,228,220,${touchesFocus ? 0.5 : 0.2})`;
        } else {
          ctx.strokeStyle = `rgba(232,228,220,${touchesFocus ? 0.35 : e.type === 'supports' ? 0.1 : 0.05})`;
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Stars: crisp dots. Opacity is retention; nothing glows.
      for (const n of nodes) {
        if (!visible(n)) continue;
        const [r, g, b] = KIND_RGB[n.m.kind];
        const { x, y } = pos.get(n.id)!;
        const highlighted = p.highlightIds.has(n.id);
        const dimOthers = p.highlightIds.size > 0 && !highlighted;

        if (n.m.status !== 'active') {
          ctx.strokeStyle = `rgba(${r},${g},${b},${dimOthers ? 0.12 : 0.3})`;
          ctx.lineWidth = 0.75;
          ctx.beginPath();
          circle(x, y, Math.max(2, n.r * 0.85));
          ctx.stroke();
        } else {
          const R = retentionAt(n.m, p.warpDays, p.timeWarp, now);
          const faded = R < FADED_THRESHOLD;
          const alpha = (faded ? 0.16 : 0.3 + 0.7 * Math.min(1, R)) * (dimOthers ? 0.35 : 1);
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
          ctx.beginPath();
          circle(x, y, faded ? 1.1 : n.r);
          ctx.fill();
          // Well-used, still-strong memories get a fine orbit ring.
          if (!faded && n.m.recallCount >= 4 && R > 0.5 && !dimOthers) {
            ctx.strokeStyle = `rgba(${r},${g},${b},${0.18 * R})`;
            ctx.lineWidth = 0.75;
            ctx.beginPath();
            circle(x, y, n.r + 3.5);
            ctx.stroke();
          }
        }

        if (highlighted || n.id === p.selectedId || n.id === focus) {
          // Reticle: a thin ring with four ticks.
          const rr = n.r + 6;
          ctx.strokeStyle = n.id === p.selectedId ? 'rgba(232,228,220,0.9)' : 'rgba(214,182,132,0.85)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          circle(x, y, rr);
          ctx.moveTo(x + rr + 2, y);
          ctx.lineTo(x + rr + 6, y);
          ctx.moveTo(x - rr - 2, y);
          ctx.lineTo(x - rr - 6, y);
          ctx.moveTo(x, y + rr + 2);
          ctx.lineTo(x, y + rr + 6);
          ctx.moveTo(x, y - rr - 2);
          ctx.lineTo(x, y - rr - 6);
          ctx.stroke();
        }
      }

      // Activity: one thin ring expands once when a memory is stored or recalled.
      const nowMs = performance.now();
      for (const [id, start] of p.flares) {
        const n = nodesRef.current.get(id);
        const age = nowMs - start;
        if (!n || age < 0 || age > 1400 || !visible(n)) continue;
        const q = age / 1400;
        const ease = 1 - (1 - q) ** 3;
        const { x, y } = pos.get(id)!;
        ctx.strokeStyle = `rgba(214,182,132,${(1 - q) * 0.55})`;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        circle(x, y, n.r + 2 + ease * 22);
        ctx.stroke();
      }

      // Labels for the focused / labelled star.
      ctx.font = `500 11px ${family}, ui-sans-serif, system-ui`;
      for (const n of nodes) {
        if (!visible(n) || !(n.id === focus || n.id === p.labelId)) continue;
        const { x, y } = pos.get(n.id)!;
        const text = n.m.content.length > 56 ? `${n.m.content.slice(0, 55)}…` : n.m.content;
        const tw = ctx.measureText(text).width;
        const bx = Math.min(Math.max(area.left + 8, x + 16), w - (w >= 768 ? area.right : 0) - tw - 24);
        const by = Math.max(8, y - 30);
        ctx.fillStyle = 'rgba(12,12,14,0.92)';
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(Math.round(bx) + 0.5, Math.round(by) + 0.5, Math.round(tw + 16), 22);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = n.m.status === 'active' ? '#ece8e1' : '#8a8780';
        ctx.fillText(text, bx + 8, by + 15);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const pick = (ev: PointerEvent | MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;
      const hidden = propsRef.current.hiddenKinds;
      let best: Node | null = null;
      let bestD = Infinity;
      for (const n of nodesRef.current.values()) {
        if (hidden.has(n.m.kind)) continue;
        const s = toScreen(n.x!, n.y!);
        const d = Math.hypot(s.x - px, s.y - py);
        if (d < n.r + 8 && d < bestD) {
          best = n;
          bestD = d;
        }
      }
      return best;
    };
    const onMove = (ev: PointerEvent) => {
      const n = pick(ev);
      hoverRef.current = n?.id ?? null;
      canvas.style.cursor = n ? 'pointer' : 'default';
    };
    const onClick = (ev: MouseEvent) => propsRef.current.onSelect(pick(ev)?.id ?? null);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('click', onClick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('click', onClick);
    };
  }, []);

  useEffect(() => () => void simRef.current?.stop(), []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label="Memory constellation" />;
}
