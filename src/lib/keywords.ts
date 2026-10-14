/**
 * Keyword research: pulling terms from DataForSEO and merging them with what
 * Search Console already knows.
 *
 * The two sources answer different halves of the same question. Search Console
 * knows what this site earns — impressions, clicks, position — for terms it
 * already shows up for. DataForSEO knows what the market looks like — volume,
 * difficulty, cost — including terms the site has never ranked for. A row that
 * has both is the useful one: proven demand plus a measured chance of winning.
 */

import { db } from './db';
import * as dfs from './dataforseo';
import type { Market, ResearchedKeyword } from './dataforseo';
import { historicalMetrics } from './googleAds';
import { keywordVolume } from './bing';
import { keywordData } from './keywordsEverywhere';
import { accessTokenFor, ADS_SCOPE } from './google';

export type ResearchSummary = {
  mode: 'site' | 'ranked' | 'seeds';
  found: number;
  created: number;
  updated: number;
  market: string;
};

/** The market this site prices keywords in, or null if not set up yet. */
export async function marketFor(siteId: string): Promise<Market | null> {
  const conn = await db.dataForSeoConnection.findUnique({ where: { siteId } });
  if (!conn) return null;
  return {
    locationCode: conn.locationCode,
    locationName: conn.locationName,
    languageCode: conn.languageCode,
    languageName: conn.languageName,
  };
}

/**
 * Intent from the shape of the phrase.
 *
 * A coarse rule, deliberately: it is a sorting aid, not a claim. DataForSEO
 * does return a search_intent field on some endpoints, but not on the ones we
 * call here, and inventing precision would be worse than an honest heuristic.
 */
function guessIntent(keyword: string): 'INFORMATIONAL' | 'COMMERCIAL' | 'TRANSACTIONAL' | 'NAVIGATIONAL' {
  const k = ` ${keyword.toLowerCase()} `;
  if (/\b(buy|price|pricing|cost|cheap|discount|coupon|deal|subscription|plan)\b/.test(k)) return 'TRANSACTIONAL';
  if (/\b(best|top|vs|versus|alternative|alternatives|review|reviews|compare|comparison|software|tool|tools)\b/.test(k)) return 'COMMERCIAL';
  if (/\b(login|log in|sign in|download|app|dashboard|portal)\b/.test(k)) return 'NAVIGATIONAL';
  return 'INFORMATIONAL';
}

/**
 * Worth-doing score from demand against difficulty.
 *
 * High volume with high difficulty is not an opportunity for a small site, and
 * a keyword with no volume is not one at any difficulty — so neither number
 * alone decides it.
 */
function impact(volume: number, difficulty: number | null): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (!volume) return 'LOW';
  const d = difficulty ?? 50;
  if (volume >= 500 && d <= 40) return 'HIGH';
  if (volume >= 100 && d <= 60) return 'MEDIUM';
  if (volume >= 2000 && d <= 70) return 'MEDIUM';
  return 'LOW';
}

/**
 * Store what the provider returned.
 *
 * Search Console fields are never overwritten: if a term already has real
 * impressions and a real position, that is measured truth about this site and
 * the provider's estimate does not get to replace it.
 */
async function save(siteId: string, rows: ResearchedKeyword[]): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  const now = new Date();

  for (const row of rows) {
    if (!row.keyword) continue;

    const existing = await db.keyword.findUnique({
      where: { siteId_keyword: { siteId, keyword: row.keyword } },
    });

    const shared = {
      volume: row.volume,
      difficulty: row.difficulty ?? 0,
      cpc: row.cpc,
      competition: row.competition,
      researchedAt: now,
      intent: guessIntent(row.keyword),
      opportunity: impact(row.volume, row.difficulty),
    };

    if (existing) {
      await db.keyword.update({
        where: { id: existing.id },
        data: {
          ...shared,
          // Only fill a position we do not already have from Search Console.
          position: existing.position ?? row.position,
          source: existing.source === 'SEARCH_CONSOLE' ? 'SEARCH_CONSOLE' : 'DATAFORSEO',
        },
      });
      updated++;
    } else {
      await db.keyword.create({
        data: { siteId, keyword: row.keyword, ...shared, position: row.position, source: 'DATAFORSEO' },
      });
      created++;
    }
  }

  return { created, updated };
}

export async function research(
  siteId: string,
  mode: 'site' | 'ranked' | 'seeds',
  seeds: string[],
  limit: number,
): Promise<ResearchSummary> {
  const site = await db.site.findUniqueOrThrow({ where: { id: siteId } });
  const market = await marketFor(siteId);
  if (!market) throw new Error('Pick a market in Settings before running keyword research');

  const rows =
    mode === 'seeds' ? await dfs.keywordIdeas(seeds, market, limit)
    : mode === 'ranked' ? await dfs.rankedKeywords(site.domain, market, limit)
    : await dfs.keywordsForSite(site.domain, market, limit);

  const { created, updated } = await save(siteId, rows);

  await db.dataForSeoConnection.update({
    where: { siteId },
    data: { lastResearchAt: new Date(), keywordsPulled: { increment: rows.length }, lastError: null },
  });

  return { mode, found: rows.length, created, updated, market: `${market.locationName} · ${market.languageName}` };
}

/**
 * Grade the Search Console queries we already have.
 *
 * These arrive with impressions and a position but no difficulty, so there is
 * no way to tell a near-miss worth chasing from one guarded by the whole
 * industry. One call covers up to 1000 terms.
 */
export async function enrich(siteId: string, limit: number): Promise<{ graded: number; checked: number }> {
  const market = await marketFor(siteId);
  if (!market) throw new Error('Pick a market in Settings before enriching keywords');

  const pending = await db.keyword.findMany({
    where: { siteId, OR: [{ researchedAt: null }, { difficulty: 0 }] },
    orderBy: { impressions: 'desc' },
    take: limit,
    select: { id: true, keyword: true, volume: true },
  });
  if (!pending.length) return { graded: 0, checked: 0 };

  const scores = await dfs.bulkDifficulty(pending.map((k) => k.keyword), market);

  let graded = 0;
  for (const k of pending) {
    const d = scores.get(k.keyword);
    if (d === undefined) continue;
    await db.keyword.update({
      where: { id: k.id },
      data: { difficulty: d, researchedAt: new Date(), opportunity: impact(k.volume, d) },
    });
    graded++;
  }

  await db.dataForSeoConnection.update({ where: { siteId }, data: { lastResearchAt: new Date() } });
  return { graded, checked: pending.length };
}

/**
 * Enrich the site's keywords with Google Ads Keyword Planner volume &
 * competition — the free alternative to a paid provider.
 *
 * Google Ads measures ad competition, not SEO difficulty, so the competition
 * index doubles as the difficulty signal here: it is the best free proxy for
 * how contested a term is, and it drives both the chip and the opportunity
 * score the same way a difficulty score would.
 */
export async function enrichWithGoogleAds(
  siteId: string,
  limit: number,
): Promise<{ graded: number; checked: number }> {
  const market = await db.googleAdsConnection.findUnique({ where: { siteId } });
  if (!market) throw new Error('Connect a market before pulling from Google Ads');

  // The Keyword Planner call needs the adwords scope, which older Search Console
  // connections were not granted. Fail with the fix rather than a raw 401.
  const gsc = await db.gscConnection.findUnique({ where: { siteId }, select: { scope: true } });
  if (!gsc) throw new Error('Connect Google (Search Console) first — Keyword Planner uses the same login');
  if (!gsc.scope.includes(ADS_SCOPE)) {
    throw new Error('Reconnect Google to grant Keyword Planner access (the adwords permission)');
  }

  const pending = await db.keyword.findMany({
    where: { siteId },
    orderBy: [{ impressions: 'desc' }, { keyword: 'asc' }],
    take: limit,
    select: { id: true, keyword: true },
  });
  if (!pending.length) return { graded: 0, checked: 0 };

  const token = await accessTokenFor(siteId);
  const metrics = await historicalMetrics(
    token,
    { geoTarget: market.geoTarget, languageId: market.languageId },
    pending.map((k) => k.keyword),
  );
  const byKeyword = new Map(metrics.map((m) => [m.keyword, m]));

  const now = new Date();
  let graded = 0;
  for (const k of pending) {
    const m = byKeyword.get(k.keyword.toLowerCase());
    if (!m) continue;
    const difficulty = m.competition != null ? Math.round(m.competition * 100) : 0;
    await db.keyword.update({
      where: { id: k.id },
      data: {
        volume: m.volume,
        competition: m.competition,
        cpc: m.cpc,
        difficulty,
        researchedAt: now,
        opportunity: impact(m.volume, difficulty),
        // Source is left as-is: a Search Console query stays Search Console's,
        // we have only added the market metrics it was missing.
      },
    });
    graded++;
  }

  await db.googleAdsConnection.update({
    where: { siteId },
    data: { lastResearchAt: now, keywordsPulled: { increment: graded }, lastError: null },
  });

  return { graded, checked: pending.length };
}

/**
 * Enrich the site's keywords with Keywords Everywhere — Google Keyword Planner
 * volume & competition. The most complete free-of-approval source: it returns
 * both numbers, so the competition index also stands in as the difficulty
 * signal (Keyword Planner reports ad competition, not SEO difficulty).
 */
export async function enrichWithKeywordsEverywhere(
  siteId: string,
  limit: number,
): Promise<{ graded: number; checked: number }> {
  const pending = await db.keyword.findMany({
    where: { siteId },
    orderBy: [{ impressions: 'desc' }, { keyword: 'asc' }],
    take: limit,
    select: { id: true, keyword: true },
  });
  if (!pending.length) return { graded: 0, checked: 0 };

  const data = await keywordData(pending.map((k) => k.keyword), limit);

  const now = new Date();
  let graded = 0;
  for (const k of pending) {
    const m = data.get(k.keyword.toLowerCase());
    if (!m) continue;
    const difficulty = m.competition != null ? Math.round(m.competition * 100) : 0;
    await db.keyword.update({
      where: { id: k.id },
      data: {
        volume: m.volume,
        competition: m.competition,
        cpc: m.cpc,
        difficulty,
        researchedAt: now,
        opportunity: impact(m.volume, difficulty),
      },
    });
    graded++;
  }
  return { graded, checked: pending.length };
}

/**
 * Enrich the site's keywords with Bing Webmaster search volume.
 *
 * Bing supplies volume but not competition, so difficulty is left untouched and
 * the opportunity score is recomputed from the new volume against whatever
 * difficulty we already have.
 */
export async function enrichWithBing(
  siteId: string,
  limit: number,
): Promise<{ graded: number; checked: number }> {
  const pending = await db.keyword.findMany({
    where: { siteId },
    orderBy: [{ impressions: 'desc' }, { keyword: 'asc' }],
    take: limit,
    select: { id: true, keyword: true, difficulty: true },
  });
  if (!pending.length) return { graded: 0, checked: 0 };

  const volumes = await keywordVolume(pending.map((k) => k.keyword), Math.min(limit, 100));

  const now = new Date();
  let graded = 0;
  for (const k of pending) {
    const v = volumes.get(k.keyword.toLowerCase());
    if (v == null) continue;
    await db.keyword.update({
      where: { id: k.id },
      data: { volume: v, researchedAt: now, opportunity: impact(v, k.difficulty || null) },
    });
    graded++;
  }
  return { graded, checked: pending.length };
}

/**
 * The keywords worth writing against, for the idea generator.
 *
 * Ordered so the model sees proven demand it can realistically win first.
 */
export async function briefingKeywords(siteId: string, take = 40) {
  return db.keyword.findMany({
    where: { siteId, volume: { gt: 0 } },
    orderBy: [{ opportunity: 'asc' }, { volume: 'desc' }],
    take,
    select: { keyword: true, volume: true, difficulty: true, cpc: true, position: true, intent: true, opportunity: true },
  });
}
