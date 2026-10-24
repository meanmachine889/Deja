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

export const KIND_RGB: Record<Kind, [number, number, number]> = {
  fact: [242, 237, 230],
  preference: [245, 181, 91],
  decision: [159, 194, 255],
  convention: [168, 226, 192],
  person: [231, 179, 223],
  event: [185, 179, 168],
};
const KIND_ORDER: Kind[] = ['convention', 'decision', 'fact', 'person', 'event', 'preference'];

type Node = SimulationNodeDatum & { id: string; m: Memory; r: number; phase: number };
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

const radiusFor = (m: Memory) => 2.4 + 1.6 * Math.log2(m.recallCount + 2);

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
          phase: Math.random() * Math.PI * 2,
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
      const count = Math.round((rect.width * rect.height) / 2600);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * 0.28 + 0.03;
        d.fillStyle = `rgba(242,237,230,${a})`;
        d.beginPath();
        d.arc(Math.random() * dust.width, Math.random() * dust.height, Math.random() * 0.9 * dpr + 0.2, 0, Math.PI * 2);
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

      // Threads.
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
        if (e.type === 'contradicts' && !e.resolved) {
          ctx.strokeStyle = `rgba(255,122,107,${0.45 + 0.35 * Math.sin(t / 320)})`;
          ctx.lineWidth = 1.5;
        } else if (e.type === 'supersedes') {
          ctx.setLineDash([3, 4]);
          ctx.strokeStyle = `rgba(242,237,230,${touchesFocus ? 0.6 : 0.24})`;
          ctx.lineWidth = 1;
        } else {
          ctx.strokeStyle = `rgba(242,237,230,${touchesFocus ? 0.4 : e.type === 'supports' ? 0.12 : 0.06})`;
          ctx.lineWidth = 0.8;
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Stars.
      for (const n of nodes) {
        if (!visible(n)) continue;
        const [r, g, b] = KIND_RGB[n.m.kind];
        const { x, y } = pos.get(n.id)!;
        const highlighted = p.highlightIds.has(n.id);
        const dimOthers = p.highlightIds.size > 0 && !highlighted;

        if (n.m.status !== 'active') {
          ctx.strokeStyle = `rgba(${r},${g},${b},${dimOthers ? 0.12 : 0.32})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          circle(x, y, n.r * 0.8);
          ctx.stroke();
        } else {
          const R = retentionAt(n.m, p.warpDays, p.timeWarp, now);
          const faded = R < FADED_THRESHOLD;
          const twinkle = 0.88 + 0.12 * Math.sin(t / 900 + n.phase);
          const bright = Math.max(0.05, Math.min(1, R)) * twinkle * (dimOthers ? 0.3 : 1);
          const radius = faded ? Math.max(1.1, n.r * 0.4) : n.r * (0.75 + 0.25 * Math.min(1, R));
          if (!faded) {
            const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 4.5);
            glow.addColorStop(0, `rgba(${r},${g},${b},${0.42 * bright})`);
            glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
            ctx.fillStyle = glow;
            ctx.beginPath();
            circle(x, y, radius * 4.5);
            ctx.fill();
          }
          ctx.fillStyle = `rgba(${r},${g},${b},${faded ? 0.2 : 0.3 + 0.7 * bright})`;
          ctx.beginPath();
          circle(x, y, radius);
          ctx.fill();
        }

        if (highlighted || n.id === p.selectedId) {
          ctx.strokeStyle = `rgba(245,181,91,${0.6 + 0.3 * Math.sin(t / 400)})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          circle(x, y, n.r + 6);
          ctx.stroke();
        }
      }

      // Flares: a ring ripples out when a memory is stored or recalled.
      const nowMs = performance.now();
      for (const [id, start] of p.flares) {
        const n = nodesRef.current.get(id);
        const age = nowMs - start;
        if (!n || age < 0 || age > 1800 || !visible(n)) continue;
        const q = age / 1800;
        const { x, y } = pos.get(id)!;
        ctx.strokeStyle = `rgba(245,181,91,${(1 - q) * 0.9})`;
        ctx.lineWidth = 2 * (1 - q) + 0.5;
        ctx.beginPath();
        circle(x, y, n.r + q * 38);
        ctx.stroke();
      }

      // Labels for the focused / highlighted stars.
      ctx.font = `500 12px ${family}, ui-sans-serif, system-ui`;
      for (const n of nodes) {
        if (!visible(n) || !(n.id === focus || n.id === p.labelId)) continue;
        const { x, y } = pos.get(n.id)!;
        const text = n.m.content.length > 54 ? `${n.m.content.slice(0, 53)}…` : n.m.content;
        const tw = ctx.measureText(text).width;
        const bx = Math.min(Math.max(area.left + 8, x + 12), w - (w >= 768 ? area.right : 0) - tw - 28);
        const by = Math.max(8, y - 34);
        ctx.fillStyle = 'rgba(14,14,17,0.9)';
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, by, tw + 20, 24, 12);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = n.m.status === 'active' ? '#f2ede6' : '#8a8780';
        ctx.fillText(text, bx + 10, by + 16);
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
