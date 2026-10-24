// Drives the MCP server over stdio like a real client would. `pnpm mcp:e2e` (offline) or with --live.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const live = process.argv.includes('--live');
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', ...(live ? ['--env-file=.env'] : []), 'apps/mcp/src/index.ts'],
  env: { ...(process.env as Record<string, string>), DEJA_PROJECT: 'deja-e2e', ...(live ? {} : { DEJA_OFFLINE: '1' }) },
  stderr: 'inherit',
});
const client = new Client({ name: 'deja-e2e', version: '0.0.1' });
await client.connect(transport);

const call = async (name: string, args: Record<string, unknown>) => {
  const res = await client.callTool({ name, arguments: args });
  const out = (res.content as { text: string }[]).map((c) => c.text).join('\n');
  console.log(`\n▶ ${name} ${JSON.stringify(args)}\n${out}`);
  if (res.isError) process.exitCode = 1;
  return out;
};

const tools = await client.listTools();
console.log('tools:', tools.tools.map((t) => t.name).join(', '));

await call('remember', { content: 'We deploy the web app to Vercel' });
await call('remember', { content: 'Yash prefers pnpm over npm for every project' });
await call('remember', { content: 'We migrated the web app deploy from Vercel to Appwrite Sites' });
const recalled = await call('recall', { query: 'where do we deploy the web app' });
const id = recalled.match(/id ([0-9a-f-]{36})/)?.[1];
if (id) await call('why', { memoryId: id });
await call('conflicts', {});
await call('timeline', { limit: 10 });

await client.close();
