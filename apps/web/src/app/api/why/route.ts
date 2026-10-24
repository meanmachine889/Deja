import { ctxFrom, getDeja, handle, HttpError } from '@/lib/server';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) throw new HttpError(400, 'id is required');
  return (await getDeja()).why(await ctxFrom(req), id);
});
