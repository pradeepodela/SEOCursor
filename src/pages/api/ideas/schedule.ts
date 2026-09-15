import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { zScheduleIdea, parseBody, ok, fail } from '../../../lib/schemas';

export const prerender = false;

/** Put an idea on the calendar for a given day. */
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zScheduleIdea);
  if (parsed.res) return parsed.res;
  const { siteId, ideaId, date, autoGenerate, autoPublish } = parsed.data;

  const idea = await db.blogIdea.findFirst({ where: { id: ideaId, siteId } });
  if (!idea) return fail('Idea not found', 404);

  if (autoPublish) {
    const wp = await db.wordPressConnection.findUnique({ where: { siteId } });
    if (!wp) return fail('Connect WordPress before turning on auto-publish', 409);
  }

  const existing = await db.calendarItem.findUnique({ where: { blogIdeaId: ideaId } });

  const item = existing
    ? await db.calendarItem.update({
        where: { id: existing.id },
        data: { date, autoGenerate, autoPublish, status: 'PLANNED', ranAt: null, runError: null },
      })
    : await db.calendarItem.create({
        data: {
          siteId, date, type: 'BLOG', title: idea.title,
          blogIdeaId: ideaId, autoGenerate, autoPublish, status: 'PLANNED',
        },
      });

  await db.blogIdea.update({ where: { id: ideaId }, data: { status: 'SCHEDULED' } });
  return ok(item, existing ? 200 : 201);
};

/** Take it back off the calendar. */
export const DELETE: APIRoute = async ({ request }) => {
  const { ideaId } = await request.json().catch(() => ({}));
  if (!ideaId) return fail('Missing ideaId', 400);

  const item = await db.calendarItem.findUnique({ where: { blogIdeaId: ideaId } });
  if (!item) return fail('Not scheduled', 404);

  await db.calendarItem.delete({ where: { id: item.id } });
  await db.blogIdea.update({ where: { id: ideaId }, data: { status: 'SUGGESTED' } });
  return ok({ unscheduled: true });
};
