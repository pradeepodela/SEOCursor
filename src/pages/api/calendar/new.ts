import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { zScheduleNewArticle, parseBody, ok, fail } from '../../../lib/schemas';

export const prerender = false;

/** Title-case a bare keyword so an auto-named article reads like a headline. */
function titleFromKeyword(keyword: string): string {
  const small = new Set(['a', 'an', 'and', 'the', 'for', 'of', 'to', 'in', 'on', 'with', 'vs']);
  return keyword
    .split(/\s+/)
    .map((w, i) =>
      i > 0 && small.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(' ');
}

/**
 * Schedule a new article from the calendar. Creates a manual blog idea (the
 * thing the scheduler writes from on the day) and drops it on the calendar.
 */
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zScheduleNewArticle);
  if (parsed.res) return parsed.res;
  const { siteId, date, autoPublish } = parsed.data;
  const keyword = parsed.data.keyword.trim();
  const title = (parsed.data.title.trim() || titleFromKeyword(keyword)).slice(0, 180);

  const site = await db.site.findUnique({ where: { id: siteId } });
  if (!site) return fail('Unknown website', 404);

  if (autoPublish) {
    const wp = await db.wordPressConnection.findUnique({ where: { siteId } });
    if (!wp) return fail('Connect WordPress before turning on auto-publish', 409);
  }

  // Reuse an existing idea with the same title rather than stacking duplicates.
  const existing = await db.blogIdea.findFirst({
    where: { siteId, title: { equals: title, mode: 'insensitive' } },
  });

  const idea =
    existing ??
    (await db.blogIdea.create({
      data: {
        siteId,
        title,
        targetQuery: keyword || null,
        rationale: keyword ? `Scheduled from the calendar to target “${keyword}”.` : 'Scheduled from the calendar.',
        source: 'MANUAL',
        createdBy: 'user',
        score: 50,
      },
    }));

  if (existing && keyword && !existing.targetQuery) {
    await db.blogIdea.update({ where: { id: existing.id }, data: { targetQuery: keyword } });
  }

  const prior = await db.calendarItem.findUnique({ where: { blogIdeaId: idea.id } });
  const item = prior
    ? await db.calendarItem.update({
        where: { id: prior.id },
        data: { date, autoPublish, status: 'PLANNED', ranAt: null, runError: null },
      })
    : await db.calendarItem.create({
        data: {
          siteId,
          date,
          type: 'BLOG',
          title: idea.title,
          blogIdeaId: idea.id,
          autoGenerate: true,
          autoPublish,
          status: 'PLANNED',
        },
      });

  await db.blogIdea.update({ where: { id: idea.id }, data: { status: 'SCHEDULED' } });

  // Shaped to match the CalItem the calendar board renders.
  return ok(
    {
      id: item.id,
      date: item.date.toISOString(),
      type: item.type,
      title: item.title,
      status: item.status,
      autoGenerate: item.autoGenerate,
      autoPublish: item.autoPublish,
      ranAt: item.ranAt?.toISOString() ?? null,
      runError: item.runError,
      ideaId: idea.id,
      contentId: item.contentId,
      contentWords: null,
      wpUrl: null,
      rationale: idea.rationale,
      targetQuery: idea.targetQuery,
    },
    prior ? 200 : 201,
  );
};
