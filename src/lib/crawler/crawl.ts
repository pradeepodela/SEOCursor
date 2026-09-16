import { CheerioCrawler, PlaywrightCrawler, Configuration } from 'crawlee';
import { db } from '../db';
import { request, normalise, sameHost, pathOf } from './http';
import { fetchRobots, isAllowed, discoverSitemaps } from './robots';
import { parseHtml, inferTopic, type ParsedPage } from './parse';
import { deriveIssues } from './issues';
import { checkLinks, type LinkVerdict } from './linkcheck';
import { pickRenderMode, browserAvailable } from './render';

/**
 * The crawl.
 *
 * Crawlee owns fetching: the request queue, autoscaling, retries and session
 * rotation. Everything SEO-specific — what we extract and what counts as a
 * finding — lives in parse.ts and issues.ts and is engine-independent, so the
 * same handler runs under the HTTP crawler or the browser one.
 */

const MAX_LINK_CHECKS = 400;

type Crawled = {
  url: string;
  path: string;
  status: number;
  redirectedTo: string | null;
  hops: number;
  responseMs: number;
  sizeBytes: number;
  contentType: string;
  depth: number;
  via: string;
  parsed: ParsedPage | null;
  error?: string;
};

export async function runCrawl(siteId: string, jobId: string): Promise<void> {
  const site = await db.site.findUnique({ where: { id: siteId } });
  if (!site) throw new Error('Site not found');

  const origin = new URL(site.url).origin;
  const maxPages = site.crawlPageCap;

  const progress = (data: Record<string, unknown>) =>
    db.crawlJob.update({ where: { id: jobId }, data }).catch(() => {});

  try {
    await progress({ status: 'RUNNING', phase: 'Reading robots.txt' });

    // ---------------------------------------------------------- robots + sitemap
    const robots = await fetchRobots(origin);
    await progress({ phase: 'Discovering sitemap' });
    const { urls: sitemapUrls, sources } = await discoverSitemaps(origin, robots);

    await db.site.update({
      where: { id: siteId },
      data: { robotsTxtUrl: robots.found ? robots.url : null, sitemapUrls: sources },
    });

    // ---------------------------------------------------------- how to render
    await progress({ phase: 'Checking how the site renders' });
    let mode = await pickRenderMode(site.url);
    if (mode === 'browser' && !(await browserAvailable())) {
      // Without a browser we would read an empty shell and report every page as
      // thin. Saying so is better than producing confident nonsense.
      mode = 'http';
      await db.crawlJob.update({
        where: { id: jobId },
        data: { error: 'This site renders client-side, but no headless browser is installed — content findings may be understated. Run: npx playwright install chromium' },
      }).catch(() => {});
    }
    await progress({ phase: mode === 'browser' ? 'Crawling pages (browser)' : 'Crawling pages' });

    // ---------------------------------------------------------- seed
    const seed = normalise(site.url) ?? site.url;
    const seeds = [seed];
    for (const u of sitemapUrls) {
      if (seeds.length >= maxPages) break;
      if (sameHost(u, seed) && !seeds.includes(u) && isAllowed(robots, u)) seeds.push(u);
    }

    await progress({ pagesQueued: seeds.length });

    // ---------------------------------------------------------- crawl
    const results: Crawled[] = [];
    const allLinks: { fromUrl: string; link: ParsedPage['links'][number] }[] = [];
    const seen = new Set<string>(seeds);
    let crawled = 0;

    // Keep Crawlee's bookkeeping in memory — this runs inside a web server, not
    // a standalone scraper process, and should leave nothing on disk.
    const config = new Configuration({ persistStorage: false, storageClientOptions: {} });

    /**
     * One handler for both engines. The HTTP crawler hands us the raw body; the
     * browser crawler hands us the DOM after scripts have run. Everything after
     * that point is identical, which is the whole reason for the split.
     */
    const handler = async (ctx: any) => {
      const { request: req, response, body, page } = ctx;
      const finalUrl = req.loadedUrl ?? req.url;

      const html: string = page
        ? await page.content()
        : typeof body === 'string' ? body : body?.toString('utf8') ?? '';

      const status = (page ? response?.status?.() : response?.statusCode) ?? 0;
      const rawType = page ? response?.headers?.()['content-type'] : response?.headers?.['content-type'];
      const contentType = String(rawType ?? (page ? 'text/html' : ''));
      const redirected = finalUrl !== req.url;

      const parsed = html && contentType.includes('html') ? parseHtml(html, finalUrl) : null;
      const depth = (req.userData?.depth as number) ?? 0;

      results.push({
        url: finalUrl,
        path: pathOf(finalUrl),
        status,
        redirectedTo: redirected ? finalUrl : null,
        hops: redirected ? 1 : 0,
        responseMs: (req.userData?.startedAt ? Date.now() - (req.userData.startedAt as number) : 0),
        sizeBytes: Buffer.byteLength(html),
        contentType,
        depth,
        via: (req.userData?.via as string) ?? 'link',
        parsed,
      });

      crawled++;
      if (crawled % 5 === 0) {
        await progress({ pagesCrawled: crawled, phase: `Crawling pages (${crawled})` });
      }

      if (!parsed) return;
      for (const link of parsed.links) allLinks.push({ fromUrl: finalUrl, link });

      if (crawled >= maxPages) return;

      // Follow internal, followable links that robots.txt permits.
      const next = parsed.links
        .filter((l) => l.internal && !l.nofollow && !seen.has(l.href) && isAllowed(robots, l.href))
        .map((l) => l.href);

      for (const href of next) {
        if (seen.size >= maxPages) break;
        seen.add(href);
      }

      await ctx.addRequests(
        next
          .slice(0, Math.max(0, maxPages - results.length))
          .map((url) => ({ url, userData: { depth: depth + 1, via: 'link', startedAt: Date.now() } })),
      );
    };

    const shared = {
      maxRequestsPerCrawl: maxPages,
      requestHandlerTimeoutSecs: mode === 'browser' ? 75 : 45,
      maxRequestRetries: 2,
      requestHandler: handler,
      failedRequestHandler: async ({ request: r }: any, err: Error) => {
        results.push({
          url: r.url, path: pathOf(r.url), status: 0, redirectedTo: null, hops: 0,
          responseMs: 0, sizeBytes: 0, contentType: '', depth: (r.userData?.depth as number) ?? 0,
          via: (r.userData?.via as string) ?? 'link', parsed: null, error: err?.message ?? 'Request failed',
        });
        crawled++;
      },
    };

    const crawler = mode === 'browser'
      ? new PlaywrightCrawler(
          {
            ...shared,
            maxConcurrency: 3, // browsers are expensive; go easier on the target
            launchContext: { launchOptions: { headless: true } },
            preNavigationHooks: [async ({ request: r }: any) => { r.userData.startedAt = Date.now(); }],
          } as any,
          config,
        )
      : new CheerioCrawler(
          {
            ...shared,
            maxConcurrency: 5,
            preNavigationHooks: [async ({ request: r }: any) => { r.userData.startedAt = Date.now(); }],
          } as any,
          config,
        );

    await crawler.run(
      seeds.map((url, i) => ({ url, userData: { depth: i === 0 ? 0 : 1, via: i === 0 ? 'seed' : 'sitemap', startedAt: Date.now() } })),
    );

    await progress({ pagesCrawled: crawled, phase: 'Checking links' });

    // ---------------------------------------------------------- persist pages
    const crawledPaths = new Set<string>();
    const pageIdByUrl = new Map<string, string>();

    for (const r of results) {
      if (crawledPaths.has(r.path)) continue;
      crawledPaths.add(r.path);
      const row = await db.page.upsert({
        where: { siteId_url: { siteId, url: r.path } },
        update: pageData(r, r.parsed),
        create: { siteId, url: r.path, ...pageData(r, r.parsed) },
      });
      pageIdByUrl.set(r.url, row.id);
    }

    await db.page.deleteMany({
      where: { siteId, url: { notIn: [...crawledPaths] }, crawledAt: { not: null } },
    });

    // ---------------------------------------------------------- link check
    const unique = new Map<string, { fromUrl: string; link: ParsedPage['links'][number] }>();
    for (const l of allLinks) if (!unique.has(l.link.href)) unique.set(l.link.href, l);

    const known = new Map<string, { status: number; verdict: LinkVerdict; redirectTo: string | null; error?: string }>();
    for (const r of results) {
      known.set(r.url, {
        status: r.status,
        verdict: r.error ? 'unreachable' : r.status >= 200 && r.status < 400 ? 'ok' : r.status === 404 || r.status === 410 || r.status >= 500 ? 'broken' : 'blocked',
        redirectTo: r.redirectedTo,
        error: r.error,
      });
    }

    const statusByUrl = await checkLinks(
      [...unique.keys()].slice(0, MAX_LINK_CHECKS),
      known,
      (n, total) => progress({ linksChecked: n, phase: `Checking links (${n}/${total})` }),
    );

    // ---------------------------------------------------------- persist links
    await db.link.deleteMany({ where: { siteId } });

    const linkRows = allLinks.map(({ fromUrl, link }) => {
      const st = statusByUrl.get(link.href);
      return {
        siteId,
        fromPageId: pageIdByUrl.get(fromUrl) ?? null,
        fromUrl,
        toUrl: link.href,
        anchorText: link.anchorText,
        rel: link.rel,
        isInternal: link.internal,
        statusCode: st?.status ?? null,
        ok: st ? st.verdict === 'ok' : true,
        verdict: st?.verdict ?? 'unchecked',
        redirectTo: st?.redirectTo ?? null,
        error: st?.error ?? null,
        checkedAt: st ? new Date() : null,
      };
    });
    for (let i = 0; i < linkRows.length; i += 500) {
      await db.link.createMany({ data: linkRows.slice(i, i + 500) });
    }

    const broken = linkRows.filter((l) => l.verdict === 'broken').length;

    for (const [url, pageId] of pageIdByUrl) {
      const brokenOut = linkRows.filter((l) => l.fromUrl === url && l.verdict === 'broken').length;
      const inbound = linkRows.filter((l) => l.isInternal && l.toUrl === url && l.fromUrl !== url).length;
      await db.page.update({ where: { id: pageId }, data: { brokenLinksOut: brokenOut, inboundLinks: inbound } }).catch(() => {});
    }

    // ---------------------------------------------------------- findings
    await progress({ linksChecked: statusByUrl.size, brokenLinks: broken, phase: 'Analysing findings' });
    const hitCap = crawled >= maxPages;
    const issueCount = await deriveIssues(siteId, robots, { hitCap });

    await db.site.update({
      where: { id: siteId },
      data: { lastCrawlAt: new Date(), indexedPages: crawledPaths.size, issueCount, renderMode: mode },
    });

    await progress({ status: 'DONE', phase: 'Complete', issuesFound: issueCount, finishedAt: new Date() });
  } catch (err) {
    await progress({ status: 'FAILED', phase: 'Failed', error: (err as Error).message, finishedAt: new Date() });
    throw err;
  }
}

function pageData(r: Crawled, p: ParsedPage | null) {
  return {
    title: p?.title || (r.error ? `(${r.error})` : '(no title)'),
    metaDesc: p?.metaDescription ?? null,
    h1: p?.h1s[0] ?? null,
    primaryTopic: p ? inferTopic(p, r.path) : null,
    wordCount: p?.wordCount ?? 0,
    internalLinks: p?.internalLinks ?? 0,
    externalLinks: p?.externalLinks ?? 0,
    schemaTypes: p?.schemaTypes ?? [],
    indexable: p ? !p.noindex && r.status === 200 : false,
    canonical: p?.canonical ?? null,
    statusCode: r.status,
    redirectedTo: r.redirectedTo,
    redirectHops: r.hops,
    responseMs: r.responseMs,
    sizeBytes: r.sizeBytes,
    contentType: r.contentType,
    depth: r.depth,
    discoveredVia: r.via,
    robotsMeta: p?.robotsMeta ?? null,
    lang: p?.lang ?? null,
    ogTitle: p?.ogTitle ?? null,
    ogDescription: p?.ogDescription ?? null,
    ogImage: p?.ogImage ?? null,
    h1Count: p?.h1s.length ?? 0,
    h2Count: p?.h2s.length ?? 0,
    h2s: p?.h2s.slice(0, 25) ?? [],
    textSample: p?.textSample ?? null,
    imageCount: p?.images.length ?? 0,
    imagesMissingAlt: p?.imagesMissingAlt ?? 0,
    hasViewport: p?.hasViewport ?? false,
    contentHash: p?.contentHash ?? null,
    crawledAt: new Date(),
    health: healthOf(r, p),
  };
}

function healthOf(r: Crawled, p: ParsedPage | null): 'GOOD' | 'NEEDS_WORK' | 'POOR' {
  if (r.status >= 400 || r.error) return 'POOR';
  if (!p) return 'POOR';
  let strikes = 0;
  if (!p.title || p.titleLength > 60 || p.titleLength < 15) strikes++;
  if (!p.metaDescription) strikes++;
  if (p.h1s.length !== 1) strikes++;
  if (p.wordCount < 300) strikes += 2;
  if (!p.canonical) strikes++;
  if (r.hops > 0) strikes++;
  return strikes >= 3 ? 'POOR' : strikes >= 1 ? 'NEEDS_WORK' : 'GOOD';
}
