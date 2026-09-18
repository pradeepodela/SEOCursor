import type { APIRoute } from 'astro';
import { listTerms } from '../../../lib/wordpress';
import { db } from '../../../lib/db';
import { ok, fail } from '../../../lib/schemas';

export const prerender = false;

/**
 * The categories and tags that exist on the connected WordPress site.
 *
 * Read live rather than cached. A cached list goes stale the moment someone
 * adds a category in wp-admin, and a picker offering a category the site no
 * longer has is worse than a picker that takes an extra second to load.
 */
export const GET: APIRoute = async ({ url }) => {
  const siteId = url.searchParams.get('siteId');
  if (!siteId) return fail('Missing siteId', 400);

  const conn = await db.wordPressConnection.findUnique({ where: { siteId } });
  if (!conn) return fail('WordPress is not connected for this website', 409);

  try {
    const [categories, tags] = await Promise.all([
      listTerms(siteId, 'categories'),
      listTerms(siteId, 'tags'),
    ]);
    return ok({ categories, tags });
  } catch (e) {
    return fail((e as Error).message, 502);
  }
};
