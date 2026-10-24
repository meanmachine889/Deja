import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

// One .env at the repo root serves the MCP server, scripts and the dashboard.
const rootEnv = resolve(process.cwd(), '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const offline = process.env.DEJA_OFFLINE ?? (process.env.APPWRITE_API_KEY ? '0' : '1');

const config: NextConfig = {
  transpilePackages: ['@deja/core'],
  serverExternalPackages: ['node-appwrite'],
  env: {
    NEXT_PUBLIC_APPWRITE_ENDPOINT: process.env.APPWRITE_ENDPOINT ?? '',
    NEXT_PUBLIC_APPWRITE_PROJECT_ID: process.env.APPWRITE_PROJECT_ID ?? '',
    NEXT_PUBLIC_DEJA_OFFLINE: offline,
  },
};

export default config;
