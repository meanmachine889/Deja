// Server-side engine access for route handlers. Live mode uses Appwrite with the caller's verified
// identity; offline mode runs a seeded in-memory brain so the UI works with zero setup.
import {
  createDeja,
  Deja,
  HashEmbedder,
  HeuristicJudge,
  loadConfig,
  MemoryStore,
  seedDemo,
  type Ctx,
} from '@deja/core';
import { Account, Client } from 'node-appwrite';

export const OFFLINE = process.env.NEXT_PUBLIC_DEJA_OFFLINE === '1';
const OFFLINE_OWNER = 'demo';
const LOOSE = { duplicate: 0.06, candidate: 0.6, update: 0.5, related: 0.3 };

const cache = globalThis as unknown as { __deja?: Promise<Deja> };

// Live: a module-level engine, so edits to @deja/core apply on hot reload. Offline: kept on
// globalThis so the seeded in-memory brain survives reloads.
let live: Promise<Deja> | undefined;

export function getDeja(): Promise<Deja> {
  if (!OFFLINE) return (live ??= Promise.resolve(createDeja(loadConfig())));
  cache.__deja ??= (async () => {
    const store = new MemoryStore();
    const embedder = new HashEmbedder();
    await seedDemo({ store, embedder, ownerId: OFFLINE_OWNER });
    return new Deja({ store, embedder, judge: new HeuristicJudge(LOOSE), thresholds: LOOSE });
  })();
  return cache.__deja;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const verified = new Map<string, { ownerId: string; until: number }>();

/** Owner of the public read-only demo brain (`pnpm seed:demo --owner deja-demo`). No account exists for it. */
export const DEMO_OWNER = process.env.DEJA_DEMO_OWNER_ID || 'deja-demo';

/** Context for the public demo: no sign-in, a fixed owner. Only read-only routes use it. */
export function demoCtx(project?: string | null): Ctx {
  return { ownerId: OFFLINE ? OFFLINE_OWNER : DEMO_OWNER, sessionId: 'demo-viewer', agent: 'demo-viewer', project: project || 'global' };
}

/** Everything the dashboard draws, in one request. */
export async function brainPayload(ctx: Ctx) {
  const deja = await getDeja();
  const [graph, conflicts, events, sessions] = await Promise.all([
    deja.graph(ctx),
    deja.conflicts(ctx),
    deja.timeline(ctx, { limit: 60 }),
    deja.store.listSessions(ctx.ownerId, 20),
  ]);
  return { ...graph, conflicts, events, sessions, ownerId: ctx.ownerId, timeWarp: deja.timeWarp, now: new Date().toISOString() };
}

/** Resolve the acting user from the `X-Deja-JWT` header (an Appwrite account JWT). */
export async function ctxFrom(req: Request, project?: string | null): Promise<Ctx> {
  const base = { sessionId: 'dashboard', agent: 'dashboard', project: project || 'global' };
  if (OFFLINE) return { ...base, ownerId: OFFLINE_OWNER };
  // Appwrite Sites' proxy sets its own Authorization header, so the user's JWT travels in X-Deja-JWT.
  const jwt = req.headers.get('x-deja-jwt') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) throw new HttpError(401, 'Sign in first');
  const hit = verified.get(jwt);
  if (hit && hit.until > Date.now()) return { ...base, ownerId: hit.ownerId };
  const config = loadConfig();
  const client = new Client().setEndpoint(config.endpoint).setProject(config.projectId).setJWT(jwt);
  try {
    const user = await new Account(client).get();
    // JWTs live 15 minutes; re-verify at most once a minute instead of on every request.
    verified.set(jwt, { ownerId: user.$id, until: Date.now() + 60_000 });
    if (verified.size > 500) verified.clear();
    return { ...base, ownerId: user.$id };
  } catch {
    throw new HttpError(401, 'Session expired, sign in again');
  }
}

export function handle(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    try {
      return Response.json(await fn(req));
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      return Response.json({ error: (err as Error).message }, { status });
    }
  };
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'Expected a JSON body');
  }
}
