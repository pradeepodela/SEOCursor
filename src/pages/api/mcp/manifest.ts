import type { APIRoute } from 'astro';
import { MCP_TOOLS, MCP_RESOURCES } from '../../../lib/mcp';
import { ok } from '../../../lib/schemas';

export const prerender = false;

/** The tool and resource contract this workspace exposes to any MCP client. */
export const GET: APIRoute = async () =>
  ok({
    name: 'seo-cursor',
    version: '0.1.0',
    description: 'An AI-native SEO workspace. Crawl, analyse, plan and publish.',
    tools: MCP_TOOLS,
    resources: MCP_RESOURCES,
  });
