import { db } from './db';
import { generateBlog } from './blog';
import { publishPost } from './wordpress';
import { llmConfigured, modelBlocker } from './llm';

/**
 * The scheduled-day runner.
 *
 * Finds calendar items whose date has arrived and does what the item asked for:
 * generate a draft, and optionally publish it. Idempotent — `ranAt` stops an
 * item being processed twice, so a cron firing every minute is harmless.
 */

export type TickResult = {
  checked: number;
  generated: { id: string; title: string; words: number }[];
  published: { id: string; title: string; url: string }[];
  failed: { id: string; title: string; error: string }[];
  skipped: string[];
};

/** Local end-of-day for the given date, so an item scheduled today runs today. */
const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

export async function tick(now = new Date(), siteId?: string): Promise<TickResult> {
  const result: TickResult = { checked: 0, generated: [], published: [], failed: [], skipped: [] };

  const due = await db.calendarItem.findMany({
    where: {
      ...(siteId ? { siteId } : {}),
      date: { lte: endOfDay(now) },
      ranAt: null,
      status: { in: ['PLANNED', 'IN_PROGRESS'] },
      autoGenerate: true,
      blogIdeaId: { not: null },
    },
    include: { blogIdea: true },
    orderBy: { date: 'asc' },
    take: 10, // a cautious ceiling — these calls cost money
  });

  result.checked = due.length;
  if (!due.length) return result;

  if (!llmConfigured()) {
    result.skipped.push('No model key set (GROQ_API_KEY or OPENROUTER_API_KEY) — nothing can be generated');
    return result;
  }

  for (const item of due) {
    if (!item.blogIdea) continue;
    try {
      // Each site picks its own model, so one site pointing at a provider with
      // no key must not read as a generic failure on every scheduled post.
      const site = await db.site.findUnique({ where: { id: item.siteId }, select: { draftModel: true } });
      const blocked = site && modelBlocker(site.draftModel, 'writing model');
      if (blocked) {
        await db.calendarItem.update({ where: { id: item.id }, data: { runError: blocked } });
        result.skipped.push(`${item.blogIdea.title}: ${blocked}`);
        continue;
      }

      await db.calendarItem.update({ where: { id: item.id }, data: { status: 'IN_PROGRESS' } });

      const { piece } = await generateBlog(item.siteId, item.blogIdea.id);
      result.generated.push({ id: piece.id, title: piece.title, words: piece.wordCount });

      await db.calendarItem.update({
        where: { id: item.id },
        data: { contentId: piece.id, ranAt: new Date(), runError: null, status: item.autoPublish ? 'IN_PROGRESS' : 'DONE' },
      });

      if (item.autoPublish) {
        const wp = await db.wordPressConnection.findUnique({ where: { siteId: item.siteId } });
        if (!wp) {
          await db.calendarItem.update({
            where: { id: item.id },
            data: { runError: 'Draft written, but WordPress is not connected so it was not published', status: 'DONE' },
          });
          result.skipped.push(`${piece.title}: WordPress not connected`);
          continue;
        }

        const published = await publishPost(item.siteId, {
          id: piece.id, title: piece.title, body: piece.body,
          excerpt: piece.excerpt, slug: piece.slug, wpPostId: piece.wpPostId,
        }, { status: 'publish' });

        await db.contentPiece.update({
          where: { id: piece.id },
          data: {
            status: 'PUBLISHED', publishedAt: new Date(),
            wpPostId: published.id, wpUrl: published.link, wpStatus: published.status, publishError: null,
          },
        });
        await db.blogIdea.update({ where: { id: item.blogIdea.id }, data: { status: 'PUBLISHED' } });
        await db.calendarItem.update({ where: { id: item.id }, data: { status: 'DONE' } });

        result.published.push({ id: piece.id, title: piece.title, url: published.link });
      }
    } catch (e) {
      const error = (e as Error).message;
      await db.calendarItem.update({
        where: { id: item.id },
        data: { ranAt: new Date(), runError: error, status: 'PLANNED' },
      }).catch(() => {});
      result.failed.push({ id: item.id, title: item.title, error });
    }
  }

  return result;
}

// ---------------------------------------------------------------- in-app timer

let timer: ReturnType<typeof setInterval> | null = null;
let lastRun: Date | null = null;
let lastResult: TickResult | null = null;

const INTERVAL_MS = 5 * 60_000;

/**
 * Run the scheduler while the server is up.
 *
 * This is a convenience for local use. In production the cron endpoint is the
 * reliable path — a process that restarts loses its timer, and a serverless
 * deployment has no long-lived process at all.
 */
export function startScheduler(): void {
  if (timer) return;
  if (process.env.DISABLE_SCHEDULER === '1') return;

  timer = setInterval(() => {
    tick()
      .then((r) => {
        lastRun = new Date();
        lastResult = r;
        if (r.generated.length || r.published.length || r.failed.length) {
          console.log(`[scheduler] generated ${r.generated.length}, published ${r.published.length}, failed ${r.failed.length}`);
        }
      })
      .catch((e) => console.error('[scheduler]', (e as Error).message));
  }, INTERVAL_MS);

  // Node keeps the process alive for pending timers; this one should not.
  timer.unref?.();
}

export const schedulerStatus = () => ({
  running: timer !== null,
  intervalMinutes: INTERVAL_MS / 60_000,
  lastRun,
  lastResult,
});
