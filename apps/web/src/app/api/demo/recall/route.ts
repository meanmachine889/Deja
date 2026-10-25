import { body, demoCtx, getDeja, handle, HttpError } from '@/lib/server';

export const POST = handle(async (req) => {
  const { query, project } = await body<{ query: string; project?: string }>(req);
  if (typeof query !== 'string' || !query.trim() || query.length > 300) throw new HttpError(400, 'Ask something shorter');
  // Read-only: visitors' searches never strengthen the demo memories.
  return (await getDeja()).recall(demoCtx(project), { query, project: project ?? '', k: 8, reinforce: false });
});
