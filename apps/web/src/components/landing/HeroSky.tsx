'use client';
// Ambient hero sky: drifting dust, a few memory constellations, and a scripted loop where an old
// memory is superseded (it dims to a ring, a new star ignites, a dashed thread links them).
import { useEffect, useRef } from 'react';

type Star = { x: number; y: number; r: number; c: [number, number, number]; phase: number; life: number };

const TINTS: [number, number, number][] = [
  [242, 237, 230],
  [245, 181, 91],
  [159, 194, 255],
  [168, 226, 192],
  [231, 179, 223],
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
          r: 2 + rand() * 3.2,
          c: TINTS[cl.tint]!,
          phase: rand() * Math.PI * 2,
          life: 0.55 + rand() * 0.45,
        });
      }
    }
    const dust = Array.from({ length: 220 }, () => ({ x: rand(), y: rand(), r: rand() * 0.9 + 0.2, a: rand() * 0.35 + 0.05, p: rand() * 6 }));

    // The supersede story: `old` fades to a ring, `next` ignites beside it.
    const old = stars[11]!;
    const next: Star = { ...old, x: old.x + 0.07, y: old.y + 0.05, c: [159, 194, 255], r: 4.6, phase: 1 };
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

    const glowStar = (s: Star, bright: number, t: number) => {
      const x = s.x * w;
      const y = s.y * h;
      const tw = reduced ? 1 : 0.85 + 0.15 * Math.sin(t / 900 + s.phase);
      const b = bright * tw;
      const [r, g, bl] = s.c;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, s.r * 6);
      glow.addColorStop(0, `rgba(${r},${g},${bl},${0.4 * b})`);
      glow.addColorStop(1, `rgba(${r},${g},${bl},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, s.r * 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${r},${g},${bl},${0.35 + 0.65 * b})`;
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    };

    const draw = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      for (const d of dust) {
        const a = reduced ? d.a : d.a * (0.7 + 0.3 * Math.sin(t / 1400 + d.p));
        ctx.fillStyle = `rgba(242,237,230,${a})`;
        ctx.beginPath();
        ctx.arc(d.x * w, d.y * h, d.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Faint threads inside each cluster.
      ctx.strokeStyle = 'rgba(242,237,230,0.07)';
      ctx.lineWidth = 0.8;
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
      // 0.0–0.35 old shines · 0.35–0.55 supersede happens · 0.55–1 new shines, old is a ring.
      const swap = Math.min(1, Math.max(0, (phase - 0.35) / 0.2));

      for (const s of stars) if (s !== old) glowStar(s, s.life, t);

      // Old memory: bright → hollow ring.
      if (swap < 1) glowStar(old, (1 - swap) * 0.9, t);
      ctx.strokeStyle = `rgba(159,194,255,${0.35 * swap})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(old.x * w, old.y * h, old.r + 1, 0, Math.PI * 2);
      ctx.stroke();

      if (swap > 0) {
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = `rgba(242,237,230,${0.4 * swap})`;
        ctx.beginPath();
        ctx.moveTo(old.x * w, old.y * h);
        ctx.lineTo(next.x * w, next.y * h);
        ctx.stroke();
        ctx.setLineDash([]);
        glowStar(next, swap, t);
        // Ignition ripple.
        if (swap < 1 || phase < 0.75) {
          const q = Math.min(1, (phase - 0.35) / 0.4);
          ctx.strokeStyle = `rgba(245,181,91,${(1 - q) * 0.8})`;
          ctx.lineWidth = 2 * (1 - q) + 0.4;
          ctx.beginPath();
          ctx.arc(next.x * w, next.y * h, next.r + q * 42, 0, Math.PI * 2);
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
