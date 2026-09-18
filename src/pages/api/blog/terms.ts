import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { zSetTerms, parseBody, ok, fail } from '../../../lib/schemas';

export const prerender = false;

/**
 * Set a draft's categories and tags.
 *
 * Any edit here clears `termsFromModel`: once a person has chosen, these are
 * their terms, and the UI should stop offering to review them.
 */
export const PATCH: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zSetTerms);
  if (parsed.res) return parsed.res;
  const { contentId, categories, tags } = parsed.data;

  const piece = await db.contentPiece.findUnique({ where: { id: contentId } });
  if (!piece) return fail('Draft not found', 404);

  const updated = await db.contentPiece.update({
    where: { id: contentId },
    data: {
      ...(categories === undefined ? {} : { categories }),
      ...(tags === undefined ? {} : { tags }),
      termsFromModel: false,
    },
  });

  return ok({
    id: updated.id,
    categories: updated.categories,
    tags: updated.tags,
    termsFromModel: updated.termsFromModel,
  });
};
