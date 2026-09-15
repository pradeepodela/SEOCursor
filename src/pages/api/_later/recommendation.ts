import type { APIRoute } from 'astro';
import { db } from '../../lib/db';
import { zApplyRecommendation, parseBody, ok, fail } from '../../lib/schemas';

export const prerender = false;

export const PATCH: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zApplyRecommendation);
  if (parsed.res) return parsed.res;
  const { id, applied } = parsed.data;

  const rec = await db.pageRecommendation.findUnique({ where: { id } });
  if (!rec) return fail('Recommendation not found', 404);

  const updated = await db.pageRecommendation.update({ where: { id }, data: { applied } });

  if (applied) {
    await db.page.update({ where: { id: rec.pageId }, data: { lastUpdated: new Date() } });
  }

  return ok(updated);
};
