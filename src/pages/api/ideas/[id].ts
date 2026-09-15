import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { zUpdateIdea, parseBody, ok, fail } from '../../../lib/schemas';

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request }) => {
  const body = await request.json().catch(() => ({}));
  const parsed = zUpdateIdea.safeParse({ ...body, id: params.id });
  if (!parsed.success) {
    return fail('Validation failed', 422, parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  const { id, ...rest } = parsed.data;

  const existing = await db.blogIdea.findUnique({ where: { id } });
  if (!existing) return fail('Idea not found', 404);

  const idea = await db.blogIdea.update({ where: { id }, data: rest });
  return ok(idea);
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) return fail('Missing id', 400);
  const existing = await db.blogIdea.findUnique({ where: { id } });
  if (!existing) return fail('Idea not found', 404);

  // Dismiss rather than delete, so the generator does not re-suggest it.
  await db.blogIdea.update({ where: { id }, data: { status: 'DISMISSED' } });
  return ok({ dismissed: true });
};
