import { brainPayload, ctxFrom, handle } from '@/lib/server';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => brainPayload(await ctxFrom(req)));
