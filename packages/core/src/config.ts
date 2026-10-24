import { basename } from 'node:path';
import { z } from 'zod';

const Env = z.object({
  APPWRITE_ENDPOINT: z.string().url(),
  APPWRITE_PROJECT_ID: z.string().min(1),
  APPWRITE_API_KEY: z.string().min(1),
  DEJA_OWNER_ID: z.string().optional(),
  DEJA_PROJECT: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  DEJA_MODEL: z.string().default('claude-opus-5-5'),
  DEJA_TIME_WARP: z.coerce.number().positive().default(1),
  DEJA_VECTOR_BACKEND: z.enum(['qdrant', 'appwrite']).default('qdrant'),
  QDRANT_URL: z.string().url().default('http://localhost:6333'),
  QDRANT_API_KEY: z.string().optional(),
});

export interface DejaConfig {
  endpoint: string;
  projectId: string;
  apiKey: string;
  ownerId: string | undefined;
  project: string;
  anthropicKey: string | undefined;
  model: string;
  timeWarp: number;
  /** `qdrant` (local Docker, works on Appwrite Free) or `appwrite` (VectorsDB, needs a paid plan). */
  vectorBackend: 'qdrant' | 'appwrite';
  qdrantUrl: string;
  qdrantApiKey: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): DejaConfig {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Déjà config invalid or missing: ${missing}. Copy .env.example to .env and fill it in.`);
  }
  const e = parsed.data;
  return {
    endpoint: e.APPWRITE_ENDPOINT,
    projectId: e.APPWRITE_PROJECT_ID,
    apiKey: e.APPWRITE_API_KEY,
    ownerId: e.DEJA_OWNER_ID || undefined,
    // pnpm --dir/--filter change cwd; INIT_CWD is the folder the agent actually launched us from.
    project: normalizeProject(e.DEJA_PROJECT || basename(env.INIT_CWD || process.cwd())),
    anthropicKey: e.ANTHROPIC_API_KEY || undefined,
    model: e.DEJA_MODEL,
    timeWarp: e.DEJA_TIME_WARP,
    vectorBackend: e.DEJA_VECTOR_BACKEND,
    qdrantUrl: e.QDRANT_URL,
    qdrantApiKey: e.QDRANT_API_KEY || undefined,
  };
}

export function normalizeProject(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 64) || 'global';
}
