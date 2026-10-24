import { describe, expect, it } from 'vitest';
import { HeuristicJudge } from '../src/judge.ts';

const judge = new HeuristicJudge();
const cand = (content: string, distance: number) => ({ id: 'x', content, createdAt: '2026-10-01T00:00:00Z', distance });

describe('heuristic judge on real embedding distances', () => {
  it('does not treat a reversed preference as a duplicate even when vectors are very close', async () => {
    const [v] = await judge.relate('Yash now prefers spaces instead of tabs', [cand('Yash prefers tabs over spaces', 0.043)]);
    expect(v!.relation).toBe('updates');
  });

  it('treats near-verbatim restatements as the same memory', async () => {
    const [v] = await judge.relate('The team uses pnpm workspaces for all packages', [
      cand('The team uses pnpm workspaces for every package', 0.008),
    ]);
    expect(v!.relation).toBe('same');
  });

  it('supersedes on migration language at typical update distance', async () => {
    const [v] = await judge.relate('The team migrated the app database from Postgres to MySQL on Appwrite', [
      cand('The app database is Postgres hosted on Supabase', 0.238),
    ]);
    expect(v!.relation).toBe('updates');
  });

  it('leaves unrelated memories alone', async () => {
    const [v] = await judge.relate('Feature flags are managed in PostHog', [cand('The app database is Postgres hosted on Supabase', 0.481)]);
    expect(v!.relation).toBe('unrelated');
  });
});
