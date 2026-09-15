import type { APIRoute } from 'astro';
import { db } from '../../lib/db';
import { buildBrief, buildArticle } from '../../lib/generate';
import { zGenerateWeek, parseBody, ok, fail } from '../../lib/schemas';
import { TODAY } from '../../lib/format';

export const prerender = false;

/** Turn this week's planned calendar items into actual drafts. */
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zGenerateWeek);
  if (parsed.res) return parsed.res;
  const { siteId, from } = parsed.data;

  const start = from ?? TODAY;
  const end = new Date(start.getTime() + 7 * 86_400_000);

  const items = await db.calendarItem.findMany({
    where: { siteId, date: { gte: start, lte: end }, status: { in: ['PLANNED', 'IN_PROGRESS'] }, type: { in: ['BLOG', 'PAGE'] } },
    orderBy: { date: 'asc' },
  });

  if (!items.length) return ok({ generated: [], message: 'Nothing schedulable in the next 7 days.' });

  const generated = [];
  for (const item of items) {
    const opportunity =
      (item.opportunityId ? await db.opportunity.findUnique({ where: { id: item.opportunityId } }) : null) ??
      (await db.opportunity.findFirst({ where: { siteId, title: { contains: item.title.slice(0, 20), mode: 'insensitive' } } })) ??
      (await db.opportunity.create({
        data: {
          siteId, rank: 90, title: item.title, subject: item.title.toLowerCase(),
          type: 'NEW_CONTENT', impact: 'MEDIUM', effort: 'MEDIUM',
          recommendedAction: `Publish "${item.title}" as scheduled.`,
          reasoning: [{ source: 'Calendar', finding: `Scheduled for ${item.date.toISOString().slice(0, 10)}.` }],
        },
      }));

    const brief = await buildBrief(siteId, opportunity);
    const piece = await buildArticle(siteId, brief);
    await db.calendarItem.update({ where: { id: item.id }, data: { contentId: piece.id, status: 'IN_PROGRESS' } });
    generated.push({ id: piece.id, title: piece.title, words: piece.wordCount, seoScore: piece.seoScore, date: item.date });
  }

  return ok({ generated, message: `Generated ${generated.length} pieces.` });
};
