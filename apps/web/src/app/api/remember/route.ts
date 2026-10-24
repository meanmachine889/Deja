import { body, ctxFrom, getDeja, handle } from '@/lib/server';

export const POST = handle(async (req) => {
  const { content, project } = await body<{ content: string; project?: string }>(req);
  const ctx = await ctxFrom(req, project);
  return (await getDeja()).remember(ctx, { content });
});
