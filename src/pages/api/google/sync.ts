import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { accessTokenFor, searchAnalytics, daysAgo } from '../../../lib/google';
import { zGscSync, parseBody, ok, fail } from '../../../lib/schemas';

export const prerender = false;

/**
 * Pull real performance data and attach it to pages and keywords.
 *
 * This is what turns the crawl from "what exists" into "what actually ranks".
 */
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zGscSync);
  if (parsed.res) return parsed.res;
  const { siteId, days } = parsed.data;

  const conn = await db.gscConnection.findUnique({ where: { siteId } });
  if (!conn) return fail('Search Console is not connected for this website', 409);
  if (!conn.propertyUrl) return fail('No Search Console property is selected', 409);

  try {
    const token = await accessTokenFor(siteId);
    // GSC data lags roughly two days; asking for today returns nothing.
    const startDate = daysAgo(days + 2);
    const endDate = daysAgo(2);

    const [pageRows, queryRows, pageQueryRows] = await Promise.all([
      searchAnalytics(token, conn.propertyUrl, { startDate, endDate, dimensions: ['page'], rowLimit: 1000 }),
      searchAnalytics(token, conn.propertyUrl, { startDate, endDate, dimensions: ['query'], rowLimit: 1000 }),
      searchAnalytics(token, conn.propertyUrl, { startDate, endDate, dimensions: ['page', 'query'], rowLimit: 5000 }),
    ]);

    // ---------------------------------------------------------- pages
    const pages = await db.page.findMany({ where: { siteId } });
    const byPath = new Map(pages.map((p) => [p.url, p]));

    let matchedPages = 0;
    for (const row of pageRows) {
      const path = toPath(row.keys[0]);
      const page = byPath.get(path);
      if (!page) continue;
      matchedPages++;
      await db.page.update({
        where: { id: page.id },
        data: {
          impressions: Math.round(row.impressions),
          clicks: Math.round(row.clicks),
          traffic: Math.round(row.clicks),
          position: Number(row.position.toFixed(1)),
        },
      });
    }

    // Zero out pages that genuinely got no impressions in the window.
    const seenPaths = new Set(pageRows.map((r) => toPath(r.keys[0])));
    await db.page.updateMany({
      where: { siteId, url: { notIn: [...seenPaths] } },
      data: { impressions: 0, clicks: 0, traffic: 0, position: null },
    });

    // ---------------------------------------------------------- keywords
    // Best-performing page per query, so each keyword points at a real URL.
    const bestPageFor = new Map<string, { path: string; impressions: number }>();
    for (const row of pageQueryRows) {
      const [pageUrl, query] = row.keys;
      const path = toPath(pageUrl);
      const prev = bestPageFor.get(query);
      if (!prev || row.impressions > prev.impressions) bestPageFor.set(query, { path, impressions: row.impressions });
    }

    await db.keyword.deleteMany({ where: { siteId } });

    const keywordRows = queryRows.map((row) => {
      const query = row.keys[0];
      const best = bestPageFor.get(query);
      const page = best ? byPath.get(best.path) : undefined;
      return {
        siteId,
        pageId: page?.id ?? null,
        keyword: query,
        impressions: Math.round(row.impressions),
        clicks: Math.round(row.clicks),
        position: Number(row.position.toFixed(1)),
        // Volume and difficulty need a keyword provider; GSC does not supply them.
        volume: 0,
        difficulty: 0,
        intent: inferIntent(query),
        opportunity: opportunityOf(row.impressions, row.position, row.clicks),
      };
    });

    for (let i = 0; i < keywordRows.length; i += 500) {
      await db.keyword.createMany({ data: keywordRows.slice(i, i + 500), skipDuplicates: true });
    }

    // ---------------------------------------------------------- per-page keyword counts
    for (const page of pages) {
      const n = keywordRows.filter((k) => k.pageId === page.id).length;
      if (n !== page.keywordCount) {
        await db.page.update({ where: { id: page.id }, data: { keywordCount: n } }).catch(() => {});
      }
    }

    // ---------------------------------------------------------- site totals
    const totals = pageRows.reduce(
      (acc, r) => ({ clicks: acc.clicks + r.clicks, impressions: acc.impressions + r.impressions }),
      { clicks: 0, impressions: 0 },
    );

    await db.site.update({
      where: { id: siteId },
      data: { organicTraffic: Math.round(totals.clicks), keywordCount: keywordRows.length },
    });

    await db.gscConnection.update({
      where: { siteId },
      data: { lastSyncAt: new Date(), syncError: null },
    });

    return ok({
      property: conn.propertyUrl,
      window: { startDate, endDate, days },
      pagesInGsc: pageRows.length,
      pagesMatchedToCrawl: matchedPages,
      keywords: keywordRows.length,
      clicks: Math.round(totals.clicks),
      impressions: Math.round(totals.impressions),
    });
  } catch (e) {
    const message = (e as Error).message;
    await db.gscConnection.update({ where: { siteId }, data: { syncError: message.slice(0, 300) } }).catch(() => {});
    return fail(message, 502);
  }
};

/** GSC returns absolute URLs; our pages are keyed by path. */
function toPath(url: string): string {
  try {
    const u = new URL(url);
    let p = (u.pathname || '/') + (u.search || '');
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p;
  } catch { return url; }
}

function inferIntent(q: string): 'INFORMATIONAL' | 'COMMERCIAL' | 'TRANSACTIONAL' | 'NAVIGATIONAL' {
  if (/\b(buy|price|pricing|cost|cheap|deal|discount|order)\b/i.test(q)) return 'TRANSACTIONAL';
  if (/\b(best|top|vs|versus|review|compare|alternative|software|tool)\b/i.test(q)) return 'COMMERCIAL';
  if (/\b(how|what|why|when|guide|tutorial|example|meaning)\b/i.test(q)) return 'INFORMATIONAL';
  return 'NAVIGATIONAL';
}

/**
 * Where the realistic upside is: lots of impressions but a position just off
 * page one is the cheapest thing to improve.
 */
function opportunityOf(impressions: number, position: number, clicks: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (position > 30) return impressions > 500 ? 'MEDIUM' : 'LOW';
  if (position >= 8 && impressions >= 100) return 'HIGH';
  if (position >= 4 && clicks === 0 && impressions >= 50) return 'HIGH';
  if (position < 4) return 'LOW';
  return 'MEDIUM';
}
