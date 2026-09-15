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
