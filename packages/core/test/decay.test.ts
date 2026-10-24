import { describe, expect, it } from 'vitest';
import {
  daysUntilFaded,
  FADED_THRESHOLD,
  isFaded,
  recallScore,
  reinforcedStability,
  retention,
} from '../src/decay.ts';

const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n));

describe('forgetting curve', () => {
  it('is 1 at the moment of reinforcement and decays exponentially', () => {
    expect(retention(10, day(0), day(0))).toBe(1);
    expect(retention(10, day(0), day(10))).toBeCloseTo(Math.exp(-1));
    expect(retention(10, day(0), day(20))).toBeCloseTo(Math.exp(-2));
  });

  it('time warp ages memories faster', () => {
    const oneMinuteLater = new Date(day(0).getTime() + 60_000);
    expect(retention(1, day(0), oneMinuteLater, 1440)).toBeCloseTo(Math.exp(-1));
  });

  it('never goes negative in time', () => {
    expect(retention(10, day(5), day(0))).toBe(1);
  });

  it('reinforcing a nearly-forgotten memory strengthens it more than a fresh one', () => {
    const fresh = reinforcedStability(10, 0.95);
    const stale = reinforcedStability(10, 0.2);
    expect(stale).toBeGreaterThan(fresh);
    expect(fresh).toBeGreaterThan(10);
  });

  it('ranks closer and stronger memories higher', () => {
    expect(recallScore(0.1, 0.9)).toBeGreaterThan(recallScore(0.3, 0.9));
    expect(recallScore(0.2, 0.9)).toBeGreaterThan(recallScore(0.2, 0.1));
  });

  it('computes days until faded consistently with retention', () => {
    const d = daysUntilFaded(10, 1);
    expect(retention(10, day(0), new Date(day(0).getTime() + d * 86_400_000))).toBeCloseTo(FADED_THRESHOLD);
    expect(isFaded(FADED_THRESHOLD - 0.01)).toBe(true);
  });
});
