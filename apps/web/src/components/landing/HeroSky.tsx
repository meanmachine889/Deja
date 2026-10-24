'use client';
// Ambient hero sky in the dashboard's star-atlas style: crisp dots, hairline threads, faint chart
// rings, and a scripted loop where an old memory is superseded (it becomes a ring, a new dot appears,
// a dashed thread links them).
import { useEffect, useRef } from 'react';

type Star = { x: number; y: number; r: number; c: [number, number, number]; life: number };

const TINTS: [number, number, number][] = [
  [232, 228, 220],
  [214, 182, 132],
  [150, 172, 208],
  [150, 194, 170],
  [196, 166, 190],
];

// Constellation layout in unit space (0..1), loosely clustered like the real brain view.
const CLUSTERS = [
  { cx: 0.22, cy: 0.34, n: 5, tint: 3 },
  { cx: 0.5, cy: 0.22, n: 4, tint: 0 },
  { cx: 0.78, cy: 0.36, n: 4, tint: 2 },
  { cx: 0.32, cy: 0.7, n: 3, tint: 1 },
  { cx: 0.7, cy: 0.72, n: 4, tint: 4 },
];

function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

export function HeroSky({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const rand = seeded(7);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;

    const stars: Star[] = [];
    for (const cl of CLUSTERS) {
      for (let i = 0; i < cl.n; i++) {
        stars.push({
          x: cl.cx + (rand() - 0.5) * 0.16,
          y: cl.cy + (rand() - 0.5) * 0.18,
          r: 1.6 + rand() * 2,
          c: TINTS[cl.tint]!,
          life: 0.5 + rand() * 0.5,
        });
      }
    }
    const dust = Array.from({ length: 160 }, () => ({ x: rand(), y: rand(), r: rand() * 0.6 + 0.25, a: rand() * 0.16 + 0.03 }));

    // The supersede story: `old` becomes a hollow ring, `next` appears beside it.
    const old = stars[11]!;
    const next: Star = { ...old, x: old.x + 0.07, y: old.y + 0.05, c: [150, 172, 208], r: 3, life: 1 };
    const LOOP = 7000;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const dot = (s: Star, alpha: number) => {
      const [r, g, b] = s.c;
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      ctx.fill();
    };

    const draw = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      for (const d of dust) {
        ctx.fillStyle = `rgba(232,228,220,${d.a})`;
        ctx.beginPath();
        ctx.arc(d.x * w, d.y * h, d.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Faint chart rings and axes.
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.46;
      ctx.strokeStyle = 'rgba(232,228,220,0.045)';
      ctx.lineWidth = 1;
      for (const f of [0.4, 0.75, 1.1]) {
        ctx.beginPath();
        ctx.arc(cx, cy, R * f, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(w, cy);
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h);
      ctx.stroke();

      // Hairline threads inside each cluster.
      ctx.strokeStyle = 'rgba(232,228,220,0.08)';
      ctx.lineWidth = 0.75;
      let i = 0;
      for (const cl of CLUSTERS) {
        const group = stars.slice(i, i + cl.n);
        i += cl.n;
        for (let j = 1; j < group.length; j++) {
          ctx.beginPath();
          ctx.moveTo(group[j - 1]!.x * w, group[j - 1]!.y * h);
          ctx.lineTo(group[j]!.x * w, group[j]!.y * h);
          ctx.stroke();
        }
      }

      const phase = reduced ? 0.8 : (t % LOOP) / LOOP;
      // 0.0–0.35 old is active · 0.35–0.55 supersede happens · 0.55–1 new is active, old is a ring.
      const swap = Math.min(1, Math.max(0, (phase - 0.35) / 0.2));

      for (const s of stars) if (s !== old) dot(s, 0.3 + 0.7 * s.life);

      if (swap < 1) dot(old, (1 - swap) * 0.9);
      ctx.strokeStyle = `rgba(150,172,208,${0.4 * swap})`;
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.arc(old.x * w, old.y * h, old.r + 1.5, 0, Math.PI * 2);
      ctx.stroke();

      if (swap > 0) {
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = `rgba(232,228,220,${0.35 * swap})`;
        ctx.beginPath();
        ctx.moveTo(old.x * w, old.y * h);
        ctx.lineTo(next.x * w, next.y * h);
        ctx.stroke();
        ctx.setLineDash([]);
        dot(next, swap);
        // One thin ring marks the new memory as it lands.
        const q = Math.min(1, (phase - 0.35) / 0.35);
        if (q < 1) {
          ctx.strokeStyle = `rgba(214,182,132,${(1 - q) * 0.55})`;
          ctx.lineWidth = 0.75;
          ctx.beginPath();
          ctx.arc(next.x * w, next.y * h, next.r + 2 + (1 - (1 - q) ** 3) * 22, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      if (!reduced) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={`absolute inset-0 h-full w-full ${className}`} aria-hidden />;
}
