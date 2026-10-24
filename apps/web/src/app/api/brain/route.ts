import { ctxFrom, getDeja, handle } from '@/lib/server';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const ctx = await ctxFrom(req);
  const deja = await getDeja();
  const [graph, conflicts, events, sessions] = await Promise.all([
    deja.graph(ctx),
    deja.conflicts(ctx),
    deja.timeline(ctx, { limit: 60 }),
    deja.store.listSessions(ctx.ownerId, 20),
  ]);
  return { ...graph, conflicts, events, sessions, ownerId: ctx.ownerId, timeWarp: deja.timeWarp, now: new Date().toISOString() };
});
