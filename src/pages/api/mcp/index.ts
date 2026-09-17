import type { APIRoute } from 'astro';
import { createMcpHandler, originValidationResponse, localhostAllowedOrigins } from '@modelcontextprotocol/server';
import { createSeoServer } from '../../../mcp/server';

export const prerender = false;

/**
 * Streamable HTTP transport.
 *
 * The same server the stdio binary serves, reachable over HTTP for clients
 * that connect to a URL rather than spawning a process.
 *
 * Two guards, and both matter more here than on the rest of the API. These
 * tools crawl other people's websites, spend LLM and DataForSEO credits, and
 * can publish to a live WordPress site — an unauthenticated MCP endpoint is a
 * stranger's budget and byline. And because a browser will happily attach a
 * session to a cross-origin request, the Origin check is what stops a page the
 * user happens to be visiting from driving this endpoint on their behalf.
 */

/** One handler per process; the factory still runs per request. */
const handler = createMcpHandler(() => createSeoServer(), {
  onerror: (error) => console.error(`[mcp:http] ${error.message}`),
});

/**
 * Bearer token, required unless this is a local-only development server.
 *
 * Deliberately not optional in production: the failure mode of a public,
 * unauthenticated endpoint is someone else's crawl budget and a post on the
 * user's blog, and that is not a thing to leave to a deployment checklist.
 */
function authorize(request: Request): Response | null {
  const expected = process.env.MCP_TOKEN?.trim();

  if (!expected) {
    if (import.meta.env.PROD) {
      return json(
        503,
        'MCP_TOKEN is not set. This endpoint exposes tools that crawl sites, spend API credits and publish content, so it refuses to serve without one. Set MCP_TOKEN in the environment and send it as `Authorization: Bearer <token>`.',
      );
    }
    return null; // Local development: no token configured, no token required.
  }

  const header = request.headers.get('authorization') ?? '';
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();
  if (!token || !timingSafeEqual(token, expected)) {
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null }),
      {
        status: 401,
        headers: {
          'content-type': 'application/json',
          'www-authenticate': 'Bearer realm="seo-cursor"',
        },
      },
    );
  }
  return null;
}

/** Constant-time compare, so a wrong token leaks nothing through timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(status: number, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function serve(request: Request): Promise<Response> {
  // DNS-rebinding / cross-origin protection. A request with no Origin header
  // is a non-browser client and passes; a browser origin has to be a hostname
  // we recognise. MCP_ALLOWED_ORIGINS takes hostnames, not full origins.
  const allowed = process.env.MCP_ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean);
  const rejected = originValidationResponse(request, allowed?.length ? allowed : localhostAllowedOrigins());
  if (rejected) return rejected;

  const unauthorized = authorize(request);
  if (unauthorized) return unauthorized;

  return handler.fetch(request);
}

export const POST: APIRoute = ({ request }) => serve(request);
export const GET: APIRoute = ({ request }) => serve(request);
export const DELETE: APIRoute = ({ request }) => serve(request);
