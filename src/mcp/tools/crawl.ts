/**
 * Crawl and page-data tools.
 *
 * Everything here reports what the crawler actually found. Where a number is
 * a lower bound rather than a fact — inbound links on a capped crawl, most
 * obviously — the tool says so in its summary, because an agent that cannot
 * tell the difference will confidently recommend deleting an "orphan" page
 * that is linked from thirty pages the crawl never reached.
 */

import { z } from 'zod4';
import type { McpServer } from '@modelcontextprotocol/server';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { db } from '../../lib/db';
import { runCrawl } from '../../lib/crawler/crawl';
import { request } from '../../lib/crawler/http';
import { provisionSite } from '../../lib/provision';
import { resolveSite, result, text, guard, McpToolError, num, round1 } from '../context';
import { UI } from '../apps/registry';

const siteArg = z
  .string()
  .optional()
  .describe('Domain of the connected website, e.g. "example.com". Omit when only one is connected.');

export function registerCrawlTools(server: McpServer): void {
  // ------------------------------------------------------------- connect

  server.registerTool(
    'connect_site',
    {
      title: 'Connect a website',
      description:
        'Register a new website and start its first crawl. Verifies the site actually responds before storing anything.',
      inputSchema: z.object({
        url: z.string().describe('The website to connect, e.g. "https://example.com"'),
        maxPages: z.number().int().min(1).max(500).default(150).describe('Page cap for the first crawl.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    guard(async ({ url, maxPages }) => {
      const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;

      // Reachability first — the same guard the Connect screen applies, so a
      // typo does not leave a dead site row behind.
      const probe = await request(target, { timeoutMs: 12_000, readBody: false });
      if (probe.error) throw new McpToolError(`Could not reach ${target} — ${probe.error}`);
      if (probe.status >= 400) throw new McpToolError(`${target} returned ${probe.status}`);

      const site = await provisionSite(probe.url, [], maxPages);
      const job = await db.crawlJob.create({ data: { siteId: site.id, maxPages } });
      void runCrawl(site.id, job.id).catch((e) => console.error(`[crawl ${job.id}]`, (e as Error).message));

      return result({
        summary: `Connected ${site.domain} and started a crawl of up to ${num(maxPages)} pages. Poll \`get_crawl_status\` with crawlId "${job.id}" — a crawl of this size usually takes a few minutes.`,
        data: { siteId: site.id, domain: site.domain, crawlId: job.id, maxPages },
      });
    }),
  );

  // ------------------------------------------------------------- crawl

  server.registerTool(
    'crawl_site',
    {
      title: 'Crawl a website',
      description:
        'Re-crawl a connected website and refresh its pages, links and findings. Returns immediately with a crawl id; the crawl runs in the background.',
      inputSchema: z.object({
        site: siteArg,
        maxPages: z.number().int().min(1).max(500).default(150).describe('Page cap for this run.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    guard(async ({ site: ref, maxPages }) => {
      const site = await resolveSite(ref);

      // A second concurrent crawl of the same site would fight the first over
      // every page row, so join the running one instead of starting another.
      const running = await db.crawlJob.findFirst({
        where: { siteId: site.id, status: { in: ['QUEUED', 'RUNNING'] } },
      });
      if (running) {
        return result({
          summary: `A crawl of ${site.domain} is already ${running.status.toLowerCase()} (${num(running.pagesCrawled)} pages so far). Following that one rather than starting a second.`,
          data: { siteId: site.id, crawlId: running.id, alreadyRunning: true, maxPages: running.maxPages },
        });
      }

      await db.site.update({ where: { id: site.id }, data: { crawlPageCap: maxPages } });
      const job = await db.crawlJob.create({
        data: { siteId: site.id, maxPages, status: 'QUEUED', phase: 'Queued' },
      });
      void runCrawl(site.id, job.id).catch((e) => console.error(`[crawl ${job.id}]`, (e as Error).message));

      return result({
        summary: `Started a crawl of ${site.domain}, up to ${num(maxPages)} pages. Poll \`get_crawl_status\` with crawlId "${job.id}".`,
        data: { siteId: site.id, crawlId: job.id, alreadyRunning: false, maxPages },
      });
    }),
  );

  server.registerTool(
    'get_crawl_status',
    {
      title: 'Crawl progress',
      description: 'Progress of a running crawl, or the summary of a finished one.',
      inputSchema: z.object({
        crawlId: z.string().optional().describe('Crawl id. Omit for the most recent crawl of the site.'),
        site: siteArg,
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(async ({ crawlId, site: ref }) => {
      const job = crawlId
        ? await db.crawlJob.findUnique({ where: { id: crawlId } })
        : await db.crawlJob.findFirst({
            where: { siteId: (await resolveSite(ref)).id },
            orderBy: { startedAt: 'desc' },
          });
      if (!job) throw new McpToolError(crawlId ? `No crawl with id "${crawlId}".` : 'This website has never been crawled.');

      const site = await db.site.findUnique({ where: { id: job.siteId } });
      const done = job.status === 'DONE';

      const summary = done
        ? `Crawl of ${site?.domain} finished: ${num(job.pagesCrawled)} pages, ${num(job.linksChecked)} links checked, ${num(job.brokenLinks)} broken, ${num(job.issuesFound)} findings. Health score ${site?.healthScore ?? 0}/100.`
        : job.status === 'FAILED'
          ? `Crawl of ${site?.domain} failed: ${job.error ?? 'unknown error'}`
          : `Crawl of ${site?.domain} is ${job.status.toLowerCase()} — ${job.phase}. ${num(job.pagesCrawled)} of up to ${num(job.maxPages)} pages crawled, ${num(job.pagesQueued)} queued.`;

      return result({
        summary,
        data: {
          crawlId: job.id,
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
          startedAt: job.startedAt?.toISOString() ?? null,
          finishedAt: job.finishedAt?.toISOString() ?? null,
          healthScore: done ? (site?.healthScore ?? 0) : null,
        },
      });
    }),
  );

  // ------------------------------------------------------------- site summary

  server.registerTool(
    'get_site',
    {
      title: 'Website summary',
      description:
        'Crawl summary and health scores for a connected website: page count, findings, score breakdown and what is connected.',
      inputSchema: z.object({ site: siteArg }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(async ({ site: ref }) => {
      const ptr = await resolveSite(ref);
      const site = await db.site.findUniqueOrThrow({ where: { id: ptr.id } });

      const [pages, issues, critical, gsc, wp, lastCrawl] = await Promise.all([
        db.page.count({ where: { siteId: site.id, crawledAt: { not: null } } }),
        db.auditIssue.count({ where: { siteId: site.id, resolved: false } }),
        db.auditIssue.count({ where: { siteId: site.id, resolved: false, severity: 'CRITICAL' } }),
        db.gscConnection.findUnique({ where: { siteId: site.id } }),
        db.wordPressConnection.findUnique({ where: { siteId: site.id } }),
        db.crawlJob.findFirst({ where: { siteId: site.id, status: 'DONE' }, orderBy: { finishedAt: 'desc' } }),
      ]);

      if (!site.lastCrawlAt) {
        return result({
          summary: `${site.domain} is connected but has never been crawled. Run \`crawl_site\` first — every other tool reads from crawl data.`,
          data: { domain: site.domain, crawled: false },
        });
      }

      // Backlink authority is absent on purpose: a crawl cannot observe who
      // links to you from outside, and a score invented to fill the slot would
      // be the one number here that is not measured.
      return result({
        summary:
          `${site.domain} — health ${site.healthScore}/100 across ${num(pages)} crawled pages. ` +
          `${num(issues)} open findings (${num(critical)} critical). ` +
          `Last crawled ${site.lastCrawlAt.toISOString().slice(0, 10)} in ${site.renderMode} mode. ` +
          `Search Console ${gsc ? 'connected' : 'not connected'}; WordPress ${wp ? 'connected' : 'not connected'}.`,
        data: {
          siteId: site.id,
          domain: site.domain,
          url: site.url,
          name: site.name,
          crawled: true,
          healthScore: site.healthScore,
          scores: {
            technical: site.technicalScore,
            onPage: site.onPageScore,
            content: site.contentScore,
            ux: site.uxScore,
          },
          pages,
          openIssues: issues,
          criticalIssues: critical,
          lastCrawlAt: site.lastCrawlAt.toISOString(),
          renderMode: site.renderMode,
          crawlPageCap: site.crawlPageCap,
          crawlWasCapped: lastCrawl ? lastCrawl.pagesCrawled >= lastCrawl.maxPages : false,
          connections: { searchConsole: !!gsc, wordpress: !!wp },
        },
      });
    }),
  );

  // ------------------------------------------------------------- pages (app)

  registerAppTool(
    server,
    'get_pages',
    {
      title: 'Crawled pages',
      description:
        'Every crawled page with status, depth, word count, inbound links and search performance. Supports a text filter.',
      inputSchema: z.object({
        site: siteArg,
        q: z.string().optional().describe('Filter on URL or title.'),
        limit: z.number().int().min(1).max(500).default(100),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: UI.pages } },
    },
    guard(async ({ site: ref, q, limit }) => {
      const site = await resolveSite(ref);
      const where = {
        siteId: site.id,
        crawledAt: { not: null },
        ...(q
          ? {
              OR: [
                { url: { contains: q, mode: 'insensitive' as const } },
                { title: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };

      const [rows, total, capped] = await Promise.all([
        db.page.findMany({ where, orderBy: [{ depth: 'asc' }, { inboundLinks: 'desc' }], take: limit }),
        db.page.count({ where }),
        db.crawlJob.findFirst({ where: { siteId: site.id, status: 'DONE' }, orderBy: { finishedAt: 'desc' } }),
      ]);

      if (!total) {
        throw new McpToolError(
          q
            ? `No crawled page on ${site.domain} matches "${q}".`
            : `${site.domain} has no crawled pages yet. Run \`crawl_site\` first.`,
        );
      }

      const wasCapped = capped ? capped.pagesCrawled >= capped.maxPages : false;

      return result({
        summary:
          `${num(total)} crawled pages on ${site.domain}${q ? ` matching "${q}"` : ''}, showing ${num(rows.length)}.` +
          (wasCapped
            ? ` The crawl stopped at its ${num(capped!.maxPages)}-page cap, so inbound-link counts are a lower bound — do not read a low count as an orphan page.`
            : ''),
        data: {
          site: { domain: site.domain, url: site.url },
          total,
          shown: rows.length,
          crawlWasCapped: wasCapped,
          pages: rows.map((p) => ({
            url: p.url,
            title: p.title,
            metaDesc: p.metaDesc,
            h1: p.h1,
            statusCode: p.statusCode,
            depth: p.depth,
            wordCount: p.wordCount,
            inboundLinks: p.inboundLinks,
            internalLinks: p.internalLinks,
            indexable: p.indexable,
            health: p.health,
            responseMs: p.responseMs,
            impressions: p.impressions,
            clicks: p.clicks,
            position: p.position ? round1(p.position) : null,
            schemaTypes: p.schemaTypes,
            imagesMissingAlt: p.imagesMissingAlt,
            discoveredVia: p.discoveredVia,
          })),
        },
      });
    }),
  );

  // ------------------------------------------------------------- one page

  server.registerTool(
    'get_page',
    {
      title: 'Page detail',
      description:
        'Everything measured for one URL: on-page elements, headings, schema, social tags, performance and link counts.',
      inputSchema: z.object({
        url: z.string().describe('The exact page URL, or a distinctive part of it.'),
        site: siteArg,
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(async ({ url, site: ref }) => {
      const site = await resolveSite(ref);
      const page =
        (await db.page.findFirst({ where: { siteId: site.id, url } })) ??
        (await db.page.findFirst({
          where: { siteId: site.id, url: { contains: url, mode: 'insensitive' } },
          orderBy: { depth: 'asc' },
        }));
      if (!page) throw new McpToolError(`No crawled page on ${site.domain} matches "${url}".`);

      const issues = await db.auditIssue.findMany({
        where: { pageId: page.id, resolved: false },
        orderBy: { severity: 'asc' },
      });

      return result({
        summary:
          `${page.url} — HTTP ${page.statusCode ?? '?'}, ${num(page.wordCount)} words, depth ${page.depth}, ` +
          `${num(page.inboundLinks)} inbound internal links. Title: "${page.title}". ` +
          `${issues.length ? `${issues.length} open findings: ${issues.map((i) => i.title).join('; ')}` : 'No open findings.'}`,
        data: {
          url: page.url,
          title: page.title,
          metaDesc: page.metaDesc,
          h1: page.h1,
          h1Count: page.h1Count,
          h2s: page.h2s,
          canonical: page.canonical,
          robotsMeta: page.robotsMeta,
          indexable: page.indexable,
          lang: page.lang,
          statusCode: page.statusCode,
          redirectedTo: page.redirectedTo,
          redirectHops: page.redirectHops,
          responseMs: page.responseMs,
          sizeBytes: page.sizeBytes,
          depth: page.depth,
          discoveredVia: page.discoveredVia,
          wordCount: page.wordCount,
          schemaTypes: page.schemaTypes,
          og: { title: page.ogTitle, description: page.ogDescription, image: page.ogImage },
          hasViewport: page.hasViewport,
          images: { total: page.imageCount, missingAlt: page.imagesMissingAlt },
          links: {
            internal: page.internalLinks,
            external: page.externalLinks,
            inbound: page.inboundLinks,
            brokenOut: page.brokenLinksOut,
          },
          search: {
            impressions: page.impressions,
            clicks: page.clicks,
            position: page.position ? round1(page.position) : null,
          },
          issues: issues.map((i) => ({
            code: i.code,
            title: i.title,
            severity: i.severity,
            category: i.category,
            whyItMatters: i.whyItMatters,
            recommendedAction: i.recommendedAction,
          })),
        },
      });
    }),
  );

  // ------------------------------------------------------------- list sites

  server.registerTool(
    'list_sites',
    {
      title: 'Connected websites',
      description: 'Every website connected to this workspace.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(async () => {
      const sites = await db.site.findMany({
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      });
      if (!sites.length) return text('No websites are connected yet. Use `connect_site` to add one.');

      return result({
        summary: sites
          .map(
            (s) =>
              `${s.domain} — health ${s.healthScore}/100, ${num(s.indexedPages)} pages, ` +
              `${s.lastCrawlAt ? `last crawled ${s.lastCrawlAt.toISOString().slice(0, 10)}` : 'never crawled'}`,
          )
          .join('\n'),
        data: {
          sites: sites.map((s) => ({
            domain: s.domain,
            url: s.url,
            name: s.name,
            healthScore: s.healthScore,
            pages: s.indexedPages,
            openIssues: s.issueCount,
            lastCrawlAt: s.lastCrawlAt?.toISOString() ?? null,
            isPrimary: s.isPrimary,
          })),
        },
      });
    }),
  );
}
