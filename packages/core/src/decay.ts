// Forgetting-curve math. Pure and dependency-free so the dashboard can import it in the browser.
import type { Kind } from './types.ts';

const DAY_MS = 86_400_000;

/** Initial stability in days. Preferences and conventions are sticky; events fade fast. */
export const INITIAL_STABILITY: Record<Kind, number> = {
  preference: 45,
  convention: 45,
  person: 30,
  decision: 21,
  fact: 10,
  event: 3,
};

export const MAX_STABILITY = 3650;

/** Below this retention a memory is "faded": hidden from recall, drawn as dust. */
export const FADED_THRESHOLD = 0.15;

export function elapsedDays(from: Date | string, now: Date, timeWarp = 1): number {
  const start = typeof from === 'string' ? new Date(from) : from;
  return Math.max(0, ((now.getTime() - start.getTime()) / DAY_MS) * timeWarp);
}

/** Ebbinghaus retention R = e^(−t/S). */
export function retention(stability: number, lastReinforcedAt: Date | string, now: Date, timeWarp = 1): number {
  if (stability <= 0) return 0;
  return Math.exp(-elapsedDays(lastReinforcedAt, now, timeWarp) / stability);
}

/**
 * Spaced-repetition reinforcement: recalling something you had nearly forgotten strengthens it
 * the most; recalling something fresh barely changes it.
 */
export function reinforcedStability(stability: number, currentRetention: number): number {
  const next = stability * (1 + 1.5 * (1 - currentRetention)) + 0.5;
  return Math.min(MAX_STABILITY, next);
}

/** Recall ranking: mostly semantic closeness, nudged by how alive the memory is. */
export function recallScore(cosineDistance: number, currentRetention: number): number {
  const similarity = 1 - Math.min(1, Math.max(0, cosineDistance));
  return 0.75 * similarity + 0.25 * currentRetention;
}

export function isFaded(currentRetention: number): boolean {
  return currentRetention < FADED_THRESHOLD;
}

/** Days from now until retention drops below the faded threshold. */
export function daysUntilFaded(stability: number, currentRetention: number): number {
  if (currentRetention <= FADED_THRESHOLD) return 0;
  return stability * Math.log(currentRetention / FADED_THRESHOLD);
}
