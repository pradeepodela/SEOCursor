import type { APIRoute } from 'astro';
import { db } from '../../lib/db';
import { zPublishContent, parseBody, ok, fail } from '../../lib/schemas';

export const prerender = false;

/**
 * Publishing is the one action that reaches outside the workspace, so it needs
 * an explicit confirm flag rather than a bare id.
 */
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zPublishContent);
  if (parsed.res) return parsed.res;
  const { id } = parsed.data;

  const piece = await db.contentPiece.findUnique({ where: { id }, include: { brief: true } });
  if (!piece) return fail('Content not found', 404);
  if (!piece.body.trim()) return fail('This draft has no body yet — generate the article first', 409);
  if (piece.status === 'PUBLISHED') return fail('Already published', 409);

  const url = piece.brief?.recommendedUrl ?? `/blog/${piece.slug}`;

  const published = await db.contentPiece.update({
    where: { id },
    data: { status: 'PUBLISHED', publishedAt: new Date() },
  });

  // A published piece becomes a real page in the workspace.
  const page = await db.page.upsert({
    where: { siteId_url: { siteId: piece.siteId, url } },
    update: { title: piece.title, wordCount: piece.wordCount, lastUpdated: new Date(), health: 'GOOD', indexable: true },
    create: {
      siteId: piece.siteId,
      url,
      title: piece.title,
      metaDesc: piece.excerpt,
      h1: piece.title,
      primaryTopic: piece.targetKeyword,
      wordCount: piece.wordCount,
      health: 'GOOD',
      canonical: url,
      schemaTypes: ['Article'],
    },
  });

  await db.calendarItem.updateMany({ where: { contentId: id }, data: { status: 'DONE' } });

  const site = await db.site.findUnique({ where: { id: piece.siteId } });
  await db.site.update({ where: { id: piece.siteId }, data: { indexedPages: (site?.indexedPages ?? 0) + 1 } });

  return ok({ content: published, page, url, deployedAt: new Date().toISOString() });
};
