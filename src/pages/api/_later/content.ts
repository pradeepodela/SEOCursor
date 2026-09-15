import type { APIRoute } from 'astro';
import { db } from '../../lib/db';
import { mdToHtml } from '../../lib/generate';
import { zUpdateContent, zPublishContent, parseBody, ok, fail } from '../../lib/schemas';

export const prerender = false;

export const PATCH: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zUpdateContent);
  if (parsed.res) return parsed.res;
  const { id, ...rest } = parsed.data;

  const existing = await db.contentPiece.findUnique({ where: { id } });
  if (!existing) return fail('Content not found', 404);

  const wordCount = rest.body !== undefined ? rest.body.split(/\s+/).filter(Boolean).length : undefined;
  const piece = await db.contentPiece.update({ where: { id }, data: { ...rest, ...(wordCount !== undefined && { wordCount }) } });

  return ok({ ...piece, html: mdToHtml(piece.body) });
};
