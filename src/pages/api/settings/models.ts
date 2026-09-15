import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { zSetModels, parseBody, ok, fail } from '../../../lib/schemas';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zSetModels);
  if (parsed.res) return parsed.res;
  const { siteId, ...rest } = parsed.data;

  const site = await db.site.findUnique({ where: { id: siteId } });
  if (!site) return fail('Unknown website', 404);

  const updated = await db.site.update({ where: { id: siteId }, data: rest });
  return ok({ ideaModel: updated.ideaModel, draftModel: updated.draftModel });
};
