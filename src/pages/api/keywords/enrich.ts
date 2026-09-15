import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { enrich } from '../../../lib/keywords';
import { configured } from '../../../lib/dataforseo';
import { zKeywordEnrich, parseBody, ok, fail } from '../../../lib/schemas';

export const prerender = false;

/** Add difficulty to keywords we already have, usually Search Console queries. */
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zKeywordEnrich);
  if (parsed.res) return parsed.res;
  const { siteId, limit } = parsed.data;

  if (!configured()) return fail('Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to .env to grade keywords', 503);

  const conn = await db.dataForSeoConnection.findUnique({ where: { siteId } });
  if (!conn) return fail('Pick a market in Settings before grading keywords', 409);

  try {
    return ok(await enrich(siteId, limit));
  } catch (e) {
    const error = (e as Error).message;
    await db.dataForSeoConnection.update({ where: { siteId }, data: { lastError: error } }).catch(() => {});
    return fail(error, 502);
  }
};
