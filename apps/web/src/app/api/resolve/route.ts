import { body, ctxFrom, getDeja, handle } from '@/lib/server';

export const POST = handle(async (req) => {
  const { linkId, keepId } = await body<{ linkId: string; keepId: string }>(req);
  return (await getDeja()).resolve(await ctxFrom(req), linkId, keepId);
});
