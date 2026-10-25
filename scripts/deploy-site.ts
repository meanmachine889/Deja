// Deploys the dashboard to Appwrite Sites: `pnpm deploy:site` (`--bundle-only` to just build the bundle).
//
// Sites builds one app from an uploaded archive, so this flattens the monorepo into a self-contained
// Next.js app in .deploy/: apps/web at the root and packages/core vendored as ./core (a file:
// dependency). Then it creates the site if needed, syncs its environment variables from .env,
// uploads the archive and waits for the build.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Adapter, BuildRuntime, Framework, ID, Query, Sites } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { loadConfig, serverClient } from '@deja/core';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, '.deploy');
const SITE_ID = 'deja';
const bundleOnly = process.argv.includes('--bundle-only');

// ------------------------------------------------------------------ bundle

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
const skip = new Set(['node_modules', '.next', '.next-shot', '.next-build', 'tsconfig.tsbuildinfo', 'next-env.d.ts']);
cpSync(join(ROOT, 'apps/web'), OUT, { recursive: true, filter: (src) => !skip.has(src.split('/').at(-1)!) });
cpSync(join(ROOT, 'packages/core/src'), join(OUT, 'core/src'), { recursive: true });
cpSync(join(ROOT, 'tsconfig.base.json'), join(OUT, 'tsconfig.base.json'));

const web = JSON.parse(readFileSync(join(ROOT, 'apps/web/package.json'), 'utf8'));
const core = JSON.parse(readFileSync(join(ROOT, 'packages/core/package.json'), 'utf8'));
// core's runtime deps move up to the app so `core/src` resolves them from the app's node_modules.
writeFileSync(
  join(OUT, 'core/package.json'),
  JSON.stringify({ name: '@deja/core', version: core.version, private: true, type: 'module', exports: core.exports }, null, 2),
);
const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
// Everything the build needs goes in dependencies: the build host may skip devDependencies.
const deps = {
  ...core.dependencies,
  ...web.dependencies,
  ...web.devDependencies,
  typescript: rootPkg.devDependencies.typescript,
  '@types/node': rootPkg.devDependencies['@types/node'],
  '@deja/core': 'file:./core',
};
writeFileSync(
  join(OUT, 'package.json'),
  JSON.stringify({ ...web, name: 'deja-web', scripts: { build: 'next build', start: 'next start' }, dependencies: deps, devDependencies: undefined }, null, 2),
);
const tsconfig = JSON.parse(readFileSync(join(OUT, 'tsconfig.json'), 'utf8'));
tsconfig.extends = './tsconfig.base.json';
tsconfig.exclude = ['node_modules', 'core'];
writeFileSync(join(OUT, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

execFileSync('tar', ['--exclude', 'code.tar.gz', '-czf', 'code.tar.gz', '.'], { cwd: OUT });
console.log(`Bundle ready: ${OUT}/code.tar.gz`);
if (bundleOnly) process.exit(0);

// ------------------------------------------------------------------ site

const config = loadConfig();
const sites = new Sites(serverClient(config));
const INSTALL = 'npm install --no-audit --no-fund';
const BUILD = 'npm run build';

try {
  await sites.get({ siteId: SITE_ID });
  console.log(`Site ${SITE_ID} exists`);
} catch {
  await sites.create({
    siteId: SITE_ID,
    name: 'Déjà',
    framework: Framework.Nextjs,
    adapter: Adapter.Ssr,
    buildRuntime: BuildRuntime.Node22,
    installCommand: INSTALL,
    buildCommand: BUILD,
    outputDirectory: './.next',
  });
  console.log(`Created site ${SITE_ID}`);
}

// A Qdrant on this machine is unreachable from Appwrite's servers: the site then searches with the
// `tables` backend (TablesDB + Appwrite Embeddings, no extra service).
const localQdrant = config.vectorBackend === 'qdrant' && /localhost|127\.0\.0\.1/.test(config.qdrantUrl);
const backend = localQdrant ? 'tables' : config.vectorBackend;
if (localQdrant) console.log('Qdrant is local, so the site will use the tables vector backend');

// Server-side config for the API routes; NEXT_PUBLIC_* are derived from these at build time.
const vars: Record<string, { value: string | undefined; secret: boolean }> = {
  APPWRITE_ENDPOINT: { value: config.endpoint, secret: false },
  APPWRITE_PROJECT_ID: { value: config.projectId, secret: false },
  APPWRITE_API_KEY: { value: config.apiKey, secret: true },
  DEJA_OFFLINE: { value: '0', secret: false },
  DEJA_VECTOR_BACKEND: { value: backend, secret: false },
  QDRANT_URL: { value: backend === 'qdrant' ? config.qdrantUrl : undefined, secret: false },
  QDRANT_API_KEY: { value: backend === 'qdrant' ? config.qdrantApiKey : undefined, secret: true },
  DEJA_TIME_WARP: { value: String(config.timeWarp), secret: false },
};
const existing = (await sites.listVariables({ siteId: SITE_ID, queries: [Query.limit(100)] })).variables;
for (const [key, { value, secret }] of Object.entries(vars)) {
  if (value === undefined) continue;
  const v = existing.find((x) => x.key === key);
  if (v) await sites.updateVariable({ siteId: SITE_ID, variableId: v.$id, key, value, secret });
  else await sites.createVariable({ siteId: SITE_ID, variableId: ID.unique(), key, value, secret });
}
console.log(`Synced ${Object.keys(vars).length} variables`);

const deployment = await sites.createDeployment({
  siteId: SITE_ID,
  code: InputFile.fromPath(join(OUT, 'code.tar.gz'), 'code.tar.gz'),
  installCommand: INSTALL,
  buildCommand: BUILD,
  outputDirectory: './.next',
  activate: true,
});
console.log(`Deployment ${deployment.$id} uploaded, building…`);

for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const d = await sites.getDeployment({ siteId: SITE_ID, deploymentId: deployment.$id });
  process.stdout.write(`\r  status: ${d.status}      `);
  if (d.status === 'ready') {
    console.log('\nDeployed.');
    process.exit(0);
  }
  if (d.status === 'failed' || d.status === 'canceled') {
    console.log(`\nBuild ${d.status}. Last log lines:\n${d.buildLogs.split('\n').slice(-40).join('\n')}`);
    process.exit(1);
  }
}
console.log('\nStill building after 10 minutes; check the Appwrite console.');
