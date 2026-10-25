// Public, read-only: the demo brain for visitors who haven't signed in.
import { brainPayload, demoCtx, handle } from '@/lib/server';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => brainPayload(demoCtx()));
