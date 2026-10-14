/**
 * Keywords Everywhere — Google Keyword Planner volume & competition.
 *
 * The lowest-friction accurate source: an API key is issued instantly (no
 * approval board), and the `gkp` data source returns Google's own Keyword
 * Planner numbers — volume, competition and CPC — for a few dollars per ten
 * thousand lookups. One credit is spent per keyword, so enrichment is capped.
 *
 * Docs: https://api.keywordseverywhere.com/docs/
 */

import { loadEnv } from './env';

const ENDPOINT = 'https://api.keywordseverywhere.com/v1/get_keyword_data';

export type KeConfig = { apiKey: string; country: string; currency: string; dataSource: string };

export function keConfig(): KeConfig | null {
  loadEnv();
  const apiKey = process.env.KEYWORDS_EVERYWHERE_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    // Empty country = global. e.g. 'au', 'us', 'gb'.
    country: (process.env.KEYWORDS_EVERYWHERE_COUNTRY ?? '').trim().toLowerCase(),
    currency: (process.env.KEYWORDS_EVERYWHERE_CURRENCY ?? 'usd').trim().toLowerCase(),
    // 'gkp' = Google Keyword Planner (accurate); 'cli' = clickstream.
    dataSource: (process.env.KEYWORDS_EVERYWHERE_DATASOURCE ?? 'gkp').trim().toLowerCase(),
  };
}

export const keConfigured = (): boolean => keConfig() !== null;

export type KeMetric = {
  keyword: string;
  volume: number;
  /** 0–1 competition, as Keyword Planner reports it. */
  competition: number | null;
  cpc: number;
};

function parseData(json: any): KeMetric[] {
  const out: KeMetric[] = [];
  for (const row of json?.data ?? []) {
    const keyword = String(row?.keyword ?? '').trim().toLowerCase();
    if (!keyword) continue;
    const comp = typeof row?.competition === 'number' ? row.competition : Number(row?.competition);
    const cpc = row?.cpc?.value != null ? Number(row.cpc.value) : 0;
    out.push({
      keyword,
      volume: typeof row?.vol === 'number' ? row.vol : Number(row?.vol) || 0,
      competition: Number.isFinite(comp) ? Math.max(0, Math.min(1, comp)) : null,
      cpc: Number.isFinite(cpc) ? Number(cpc.toFixed(2)) : 0,
    });
  }
  return out;
}

async function fetchChunk(cfg: KeConfig, keywords: string[]): Promise<KeMetric[]> {
  const body = new URLSearchParams();
  body.set('dataSource', cfg.dataSource);
  body.set('country', cfg.country);
  body.set('currency', cfg.currency);
  for (const k of keywords) body.append('kw[]', k);

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${cfg.apiKey}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  let json: any;
  try { json = await res.json(); } catch { json = null; }
  if (!res.ok) {
    if (res.status === 401) throw new Error('Keywords Everywhere rejected the API key — check KEYWORDS_EVERYWHERE_API_KEY.');
    if (res.status === 402) throw new Error('Keywords Everywhere is out of credits — top up your account to pull volume.');
    throw new Error(json?.message || `Keywords Everywhere request failed (HTTP ${res.status})`);
  }
  return parseData(json);
}

/**
 * Volume & competition for a batch of keywords. Chunked at 100 (the API cap) and
 * capped overall, since every keyword spends a credit.
 */
export async function keywordData(keywords: string[], max = 200): Promise<Map<string, KeMetric>> {
  const cfg = keConfig();
  if (!cfg) throw new Error('Keywords Everywhere is not configured');

  const terms = [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))].slice(0, max);
  const result = new Map<string, KeMetric>();
  for (let i = 0; i < terms.length; i += 100) {
    const chunk = await fetchChunk(cfg, terms.slice(i, i + 100));
    for (const m of chunk) result.set(m.keyword, m);
  }
  return result;
}
