import type { APIRoute } from 'astro';
import { db } from '../../lib/db';
import { provisionSite } from '../../lib/provision';
import { runCrawl } from '../../lib/crawler/crawl';
import { request } from '../../lib/crawler/http';
import { zConnectSite, parseBody, ok, fail } from '../../lib/schemas';
import { SITE_COOKIE } from '../../lib/site';

export const prerender = false;

/**
 * Connect a website: verify it actually responds, register it, then start a
 * real crawl. Returns the crawl job so the client can follow progress.
 */
export const POST: APIRoute = async ({ request: req, cookies }) => {
  const parsed = await parseBody(req, zConnectSite);
  if (parsed.res) return parsed.res;
  const { url, competitors, maxPages } = parsed.data;

  // Reachability check before we commit anything to the database.
  const probe = await request(url, { timeoutMs: 12_000, readBody: false });
  if (probe.error) return fail(`Could not reach ${new URL(url).hostname} — ${probe.error}`, 422);
  if (probe.status >= 400) return fail(`${new URL(url).hostname} returned ${probe.status}`, 422);

  const site = await provisionSite(probe.url, competitors, maxPages);
  cookies.set(SITE_COOKIE, site.id, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });

  const job = await db.crawlJob.create({ data: { siteId: site.id, maxPages } });
  void runCrawl(site.id, job.id).catch((err) => console.error(`[crawl ${job.id}]`, (err as Error).message));

  return ok({ siteId: site.id, domain: site.domain, crawlId: job.id }, 202);
};
