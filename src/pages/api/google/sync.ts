import type { APIRoute } from 'astro';
import { syncSearchConsole, GscNotReady } from '../../../lib/gscSync';
import { zGscSync, parseBody, ok, fail } from '../../../lib/schemas';

export const prerender = false;

/**
 * Pull real performance data and attach it to pages and keywords.
 *
 * The sync itself lives in `lib/gscSync` because the MCP server exposes the
 * same operation to an agent, and that transport has no HTTP server in front
 * of it.
 */
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zGscSync);
  if (parsed.res) return parsed.res;
  const { siteId, days } = parsed.data;

  try {
    return ok(await syncSearchConsole(siteId, days));
  } catch (e) {
    if (e instanceof GscNotReady) return fail(e.message, e.status);
    return fail((e as Error).message, 502);
  }
};
