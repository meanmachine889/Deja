// Can this Appwrite project create a VectorsDB? Creates a throwaway database, then deletes it.
// `pnpm check:vectorsdb`
import { ID, VectorsDB } from 'node-appwrite';
import { loadConfig, serverClient } from '@deja/core';

const config = loadConfig();
const vectors = new VectorsDB(serverClient(config));
const databaseId = `probe_${ID.unique().slice(-8)}`;

console.log(`Project ${config.projectId} at ${config.endpoint}`);
try {
  await vectors.create({ databaseId, name: 'Déjà probe' });
  await vectors.delete({ databaseId });
  console.log('✓ VectorsDB works here (shared pool available). Run `pnpm setup:appwrite`.');
} catch (err) {
  console.log(`✗ VectorsDB unavailable: ${(err as Error).message}`);
  const specs = await vectors.listSpecifications().catch(() => null);
  const enabled = specs?.specifications.filter((s) => s.enabled).map((s) => `${s.slug} ($${s.price}/mo)`) ?? [];
  console.log(enabled.length ? `  Dedicated specs enabled: ${enabled.join(', ')}` : '  No dedicated specs enabled on this plan.');
  process.exitCode = 1;
}
