import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { publishPost } from '../../../lib/wordpress';
import { zPublishToWp, parseBody, ok, fail } from '../../../lib/schemas';

export const prerender = false;

/**
 * Push a draft to WordPress.
 *
 * Publishing is outward-facing, so it takes an explicit confirm rather than a
 * bare id — the same rule the rest of the app follows.
 */
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zPublishToWp);
  if (parsed.res) return parsed.res;
  const { contentId, status, categories, tags, createCategories } = parsed.data;

  const piece = await db.contentPiece.findUnique({ where: { id: contentId } });
  if (!piece) return fail('Draft not found', 404);
  if (!piece.body.trim()) return fail('This draft has no body — generate it first', 409);

  const wp = await db.wordPressConnection.findUnique({ where: { siteId: piece.siteId } });
  if (!wp) return fail('WordPress is not connected for this website', 409);

  try {
    // An explicit override wins; otherwise the draft publishes with whatever
    // terms it already carries, suggested or chosen.
    const useCategories = categories ?? piece.categories;
    const useTags = tags ?? piece.tags;

    const published = await publishPost(piece.siteId, {
      id: piece.id, title: piece.title, body: piece.body,
      excerpt: piece.excerpt, slug: piece.slug, wpPostId: piece.wpPostId,
      categories: useCategories, tags: useTags,
    }, { status, createCategories });

    const updated = await db.contentPiece.update({
      where: { id: contentId },
      data: {
        status: status === 'publish' ? 'PUBLISHED' : 'DRAFT',
        publishedAt: status === 'publish' ? new Date() : null,
        wpPostId: published.id, wpUrl: published.link, wpStatus: published.status,
        publishError: null,
        // Persist what was actually published with, so the draft reflects the
        // live post rather than an earlier intention.
        categories: useCategories, tags: useTags,
        ...(categories || tags ? { termsFromModel: false } : {}),
      },
    });

    if (piece.blogIdeaId && status === 'publish') {
      await db.blogIdea.update({ where: { id: piece.blogIdeaId }, data: { status: 'PUBLISHED' } });
      await db.calendarItem.updateMany({ where: { blogIdeaId: piece.blogIdeaId }, data: { status: 'DONE' } });
    }

    return ok({
      wpPostId: published.id,
      url: published.link,
      status: published.status,
      terms: published.terms,
      content: updated,
    });
  } catch (e) {
    const error = (e as Error).message;
    await db.contentPiece.update({ where: { id: contentId }, data: { publishError: error } }).catch(() => {});
    return fail(error, 502);
  }
};
