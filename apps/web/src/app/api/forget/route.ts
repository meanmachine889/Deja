import { body, ctxFrom, getDeja, handle } from '@/lib/server';

export const POST = handle(async (req) => {
  const { id } = await body<{ id: string }>(req);
  return (await getDeja()).forget(await ctxFrom(req), id);
});
