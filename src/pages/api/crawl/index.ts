import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { runCrawl } from '../../../lib/crawler/crawl';
import { zStartCrawl, parseBody, ok, fail } from '../../../lib/schemas';

export const prerender = false;

/**
 * Start a crawl. The job row is created synchronously and returned immediately;
 * the crawl itself runs detached and reports progress by updating that row.
 */
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zStartCrawl);
  if (parsed.res) return parsed.res;
  const { siteId, maxPages } = parsed.data;

  const site = await db.site.findUnique({ where: { id: siteId } });
  if (!site) return fail('Unknown website', 404);

  const running = await db.crawlJob.findFirst({
    where: { siteId, status: { in: ['QUEUED', 'RUNNING'] } },
  });
  if (running) return ok({ id: running.id, alreadyRunning: true });

  await db.site.update({ where: { id: siteId }, data: { crawlPageCap: maxPages } });
  const job = await db.crawlJob.create({ data: { siteId, maxPages, status: 'QUEUED', phase: 'Queued' } });

  // Detached on purpose — the response must not wait for the crawl.
  void runCrawl(siteId, job.id).catch((err) => {
    console.error(`[crawl ${job.id}] ${(err as Error).message}`);
  });

  return ok({ id: job.id, alreadyRunning: false }, 202);
};
