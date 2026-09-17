/**
 * stdio entry point — the transport a desktop MCP client spawns.
 *
 * Bundled to `bin/seo-mcp.mjs` so it runs as a plain node process with no
 * TypeScript loader and no Astro server: the host starts this directly, and it
 * talks to the same Neon database the workspace uses.
 *
 * Nothing may be written to stdout except protocol frames — stdout *is* the
 * transport. Anything this process wants to say goes to stderr, which the host
 * shows in its logs.
 */

import '../lib/env';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createSeoServer } from './server';

// The library code logs with console.log in places, and one stray line on
// stdout corrupts the JSON-RPC stream and drops the connection. Redirect it
// before anything else is imported far enough to run.
console.log = (...args: unknown[]) => console.error('[log]', ...args);
console.info = (...args: unknown[]) => console.error('[info]', ...args);

if (!process.env.DATABASE_URL) {
  console.error(
    'seo-cursor: DATABASE_URL is not set. This server reads the workspace database directly — run it from the project directory, or set DATABASE_URL in the environment.',
  );
  process.exit(1);
}

const handle = serveStdio(() => createSeoServer(), {
  onerror: (error) => console.error(`[seo-cursor] ${error.message}`),
});

console.error(`[seo-cursor] MCP server ready on stdio`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void handle.close().finally(() => process.exit(0));
  });
}
