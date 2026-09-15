import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { research } from '../../../lib/keywords';
import { configured } from '../../../lib/dataforseo';
import { zKeywordResearch, parseBody, ok, fail } from '../../../lib/schemas';

export const prerender = false;

/** Pull keywords from the provider. Every call here is billed. */
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zKeywordResearch);
  if (parsed.res) return parsed.res;
  const { siteId, mode, seeds, limit } = parsed.data;

  if (!configured()) return fail('Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to .env to run keyword research', 503);

  const conn = await db.dataForSeoConnection.findUnique({ where: { siteId } });
  if (!conn) return fail('Pick a market in Settings before running keyword research', 409);

  try {
    return ok(await research(siteId, mode, seeds, limit), 201);
  } catch (e) {
    const error = (e as Error).message;
    await db.dataForSeoConnection.update({ where: { siteId }, data: { lastError: error } }).catch(() => {});
    return fail(error, 502);
  }
};
