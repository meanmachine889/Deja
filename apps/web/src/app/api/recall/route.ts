import { body, ctxFrom, getDeja, handle } from '@/lib/server';

export const POST = handle(async (req) => {
  const { query, project } = await body<{ query: string; project?: string }>(req);
  const ctx = await ctxFrom(req, project);
  const deja = await getDeja();
  // Dashboard searches span every project unless one is selected, and browsing doesn't count as
  // the agent using a memory, so it doesn't reinforce.
  return deja.recall(ctx, { query, project: project ?? '', k: 8, reinforce: false });
});
