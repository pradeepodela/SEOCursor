import type { APIRoute } from 'astro';
import { MCP_TOOLS, MCP_RESOURCES, MCP_APPS } from '../../../lib/mcp';
import { ok } from '../../../lib/schemas';

export const prerender = false;

/**
 * A human-readable description of what this server exposes.
 *
 * This is not the MCP handshake — a client speaks JSON-RPC at `/api/mcp` or
 * runs `bin/seo-mcp.mjs` over stdio, and discovers everything through
 * `tools/list` and `resources/list`. This endpoint exists so a person can read
 * the contract in a browser without connecting anything.
 */
export const GET: APIRoute = async () =>
  ok({
    name: 'seo-cursor',
    version: '0.1.0',
    description: 'An AI-native SEO workspace. Crawl, analyse, plan and publish.',
    transports: {
      stdio: { command: 'node', args: ['bin/seo-mcp.mjs'] },
      http: { url: '/api/mcp', auth: 'Bearer MCP_TOKEN (required in production)' },
    },
    extensions: {
      // MCP Apps: tools whose results render as interactive views.
      'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] },
    },
    tools: MCP_TOOLS,
    apps: MCP_APPS,
    resources: MCP_RESOURCES,
  });
