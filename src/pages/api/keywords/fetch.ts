import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../../lib/db';
import { enrichWithGoogleAds, enrichWithBing, enrichWithKeywordsEverywhere } from '../../../lib/keywords';
import { adsConfigured } from '../../../lib/googleAds';
import { bingConfigured } from '../../../lib/bing';
import { keConfigured } from '../../../lib/keywordsEverywhere';
import { syncSearchConsole } from '../../../lib/gscSync';
import { parseBody, ok, fail } from '../../../lib/schemas';

export const prerender = false;

/** How long a provider pull stays fresh before an open re-fetches. */
const FRESH_DAYS = 7;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

const zFetchKeywords = z.object({
  siteId: z.string().min(1),
  /** Re-pull from the providers even when recent data exists (the Refresh button). */
  force: z.boolean().default(false),
});

/** Turn a 0–1 competition (or difficulty) into the Low / Medium / High chip. */
function competitionLabel(competition: number | null, difficulty: number): 'Low' | 'Medium' | 'High' | 'N/A' {
  if (competition == null && !difficulty) return 'N/A';
  const score = competition != null ? competition * 100 : difficulty || 0;
  if (score < 34) return 'Low';
  if (score < 67) return 'Medium';
  return 'High';
}

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

async function listKeywords(siteId: string) {
  const rows = await db.keyword.findMany({
    where: { siteId },
    orderBy: [{ volume: 'desc' }, { impressions: 'desc' }, { keyword: 'asc' }],
    take: 300,
    select: {
      id: true, keyword: true, volume: true, difficulty: true, competition: true,
      impressions: true, position: true, opportunity: true, intent: true, tracked: true,
    },
  });
  return rows.map((k) => ({
    id: k.id,
    keyword: k.keyword,
    volume: k.volume,
    impressions: k.impressions,
    position: k.position,
    difficulty: k.difficulty,
    competition: competitionLabel(k.competition, k.difficulty),
    // GSC-derived opportunity (High/Medium/Low) — the signal when there is no volume.
    opportunity: titleCase(k.opportunity) as 'High' | 'Medium' | 'Low',
    intent: k.intent,
    tracked: k.tracked,
    // What drives the row's display: real volume, else Search Console, else nothing.
    source: k.volume > 0 ? ('volume' as const) : k.impressions > 0 ? ('gsc' as const) : ('none' as const),
  }));
}

/**
 * Populate the keyword picker. Search Console always runs (free — it gives the
 * site's real queries, their impressions and position). A real-volume provider
 * runs on top when one is configured: Bing Webmaster first, then Google Ads.
 * Cached for a week so merely opening the scheduler never re-pulls.
 */
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zFetchKeywords);
  if (parsed.res) return parsed.res;
  const { siteId, force } = parsed.data;

  const site = await db.site.findUnique({ where: { id: siteId } });
  if (!site) return fail('Unknown website', 404);

  const [adsConn, gscConn] = await Promise.all([
    db.googleAdsConnection.findUnique({ where: { siteId } }),
    db.gscConnection.findUnique({ where: { siteId } }),
  ]);

  const gscConnected = !!gscConn?.propertyUrl;
  const keReady = keConfigured();
  const bingReady = bingConfigured();
  const adsReady = adsConfigured();
  // Precedence: Keywords Everywhere (volume + competition, instant key) first,
  // then Bing (volume, self-service), then Google Ads (needs a market).
  const volumeProvider: 'keywords-everywhere' | 'bing' | 'google-ads' | null =
    keReady ? 'keywords-everywhere' : bingReady ? 'bing' : adsReady ? 'google-ads' : null;
  const needsMarket = volumeProvider === 'google-ads' && !adsConn;

  const [kwCount, volCount, freshCount] = await Promise.all([
    db.keyword.count({ where: { siteId } }),
    db.keyword.count({ where: { siteId, volume: { gt: 0 } } }),
    db.keyword.count({ where: { siteId, researchedAt: { gte: daysAgo(FRESH_DAYS) } } }),
  ]);

  const gscStale = gscConnected && (!gscConn?.lastSyncAt || gscConn.lastSyncAt < daysAgo(FRESH_DAYS));
  const volStale = !!volumeProvider && !needsMarket && (volCount === 0 || freshCount === 0);

  const status = {
    ran: false,
    cached: false,
    gscConnected,
    gscKeywords: null as number | null,
    volumeProvider,
    needsMarket,
    enriched: null as number | null,
    errors: [] as string[],
  };

  const runGsc = gscConnected && (force || gscStale || kwCount === 0);
  const runVol = !!volumeProvider && !needsMarket && (force || volStale);

  if (!runGsc && !runVol) {
    status.cached = true;
    return ok({ keywords: await listKeywords(siteId), status });
  }

  status.ran = true;

  // Search Console — the site's own ranking queries (free; no volume/difficulty).
  if (runGsc) {
    try {
      const r = await syncSearchConsole(siteId, 90);
      status.gscKeywords = r.keywords;
    } catch (e) {
      status.errors.push(`Search Console: ${(e as Error).message}`);
    }
  }

  // Real search volume, when a provider is set up.
  if (runVol) {
    const label = volumeProvider === 'keywords-everywhere' ? 'Keywords Everywhere' : volumeProvider === 'bing' ? 'Bing' : 'Google Ads';
    try {
      const r =
        volumeProvider === 'keywords-everywhere' ? await enrichWithKeywordsEverywhere(siteId, 200)
        : volumeProvider === 'bing' ? await enrichWithBing(siteId, 100)
        : await enrichWithGoogleAds(siteId, 300);
      status.enriched = r.graded;
    } catch (e) {
      const msg = (e as Error).message;
      status.errors.push(`${label}: ${msg}`);
      if (volumeProvider === 'google-ads') {
        await db.googleAdsConnection.update({ where: { siteId }, data: { lastError: msg } }).catch(() => {});
      }
    }
  }

  return ok({ keywords: await listKeywords(siteId), status });
};
