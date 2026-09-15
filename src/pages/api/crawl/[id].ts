import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { ok, fail } from '../../../lib/schemas';

export const prerender = false;

/** Poll a crawl's progress. */
export const GET: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) return fail('Missing crawl id', 400);

  const job = await db.crawlJob.findUnique({ where: { id } });
  if (!job) return fail('Crawl not found', 404);

  const done = job.status === 'DONE';
  const site = done ? await db.site.findUnique({ where: { id: job.siteId } }) : null;

  const summary = done
    ? {
        pages: site?.indexedPages ?? job.pagesCrawled,
        issues: job.issuesFound,
        brokenLinks: job.brokenLinks,
        linksChecked: job.linksChecked,
        healthScore: site?.healthScore ?? 0,
        criticalIssues: await db.auditIssue.count({ where: { siteId: job.siteId, severity: 'CRITICAL', resolved: false } }),
      }
    : null;

  return ok({
    id: job.id,
    siteId: job.siteId,
    status: job.status,
    phase: job.phase,
    pagesCrawled: job.pagesCrawled,
    pagesQueued: job.pagesQueued,
    linksChecked: job.linksChecked,
    brokenLinks: job.brokenLinks,
    issuesFound: job.issuesFound,
    maxPages: job.maxPages,
    error: job.error,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    summary,
  });
};
