import type { APIRoute } from 'astro';
import { db } from '../../lib/db';
import { buildArticle, mdToHtml } from '../../lib/generate';
import { zGenerateArticle, parseBody, ok, fail } from '../../lib/schemas';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zGenerateArticle);
  if (parsed.res) return parsed.res;
  const { siteId, briefId } = parsed.data;

  const brief = await db.contentBrief.findFirst({ where: { id: briefId, siteId } });
  if (!brief) return fail('Brief not found', 404);

  const piece = await buildArticle(siteId, brief);

  return ok({
    id: piece.id,
    title: piece.title,
    slug: piece.slug,
    url: brief.recommendedUrl,
    wordCount: piece.wordCount,
    seoScore: piece.seoScore,
    status: piece.status,
    html: mdToHtml(piece.body),
  });
};
