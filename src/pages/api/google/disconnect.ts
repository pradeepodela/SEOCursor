import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { zGscDisconnect, parseBody, ok, fail } from '../../../lib/schemas';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zGscDisconnect);
  if (parsed.res) return parsed.res;
  const { siteId, confirm } = parsed.data;

  const conn = await db.gscConnection.findUnique({ where: { siteId } });
  if (!conn) return fail('Nothing connected', 404);

  await db.gscConnection.delete({ where: { siteId } });
  // Performance figures came from Google; without the connection they are stale.
  await db.keyword.deleteMany({ where: { siteId } });
  await db.page.updateMany({ where: { siteId }, data: { impressions: 0, clicks: 0, traffic: 0, position: null, keywordCount: 0 } });
  await db.site.update({ where: { id: siteId }, data: { organicTraffic: 0, keywordCount: 0 } });

  return ok({ disconnected: true });
};
