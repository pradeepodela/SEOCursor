/**
 * Bing Webmaster Tools — keyword search volume.
 *
 * A free alternative to DataForSEO / Google Ads for real search volume: the API
 * key is self-service (Bing Webmaster → Settings → API access), with no approval
 * board. It is Bing's volume, not Google's — and Bing is a smaller engine, so
 * niche terms can read very low — but it is a real, free signal.
 *
 * The working endpoint is `GetKeywordStats`: it returns a monthly time series of
 * Bing search impressions for one keyword, in a country + language, over a date
 * window. (`GetKeyword` exists but always returns zero.) Dates are plain ISO
 * `YYYY-MM-DD`; the `/Date(ms)/` form is rejected. One call per keyword, so the
 * work is throttled and capped to stay inside Bing's rate limits.
 */

import { loadEnv } from './env';

const BASE = 'https://ssl.bing.com/webmaster/api.svc/json';

export type BingConfig = { apiKey: string; country: string; language: string };

export function bingConfig(): BingConfig | null {
  loadEnv();
  const apiKey = process.env.BING_WEBMASTER_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    // Empty country = all markets, a reasonable default volume proxy.
    country: (process.env.BING_COUNTRY ?? '').trim().toLowerCase(),
    language: (process.env.BING_LANGUAGE ?? 'en-US').trim(),
  };
}

export const bingConfigured = (): boolean => bingConfig() !== null;

/** Bing's GET endpoints take plain ISO dates. */
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Most recent month's Bing impressions for one keyword, or 0 when Bing has none. */
async function getKeywordStats(cfg: BingConfig, q: string, start: Date, end: Date): Promise<number | null> {
  const params = new URLSearchParams({
    apikey: cfg.apiKey,
    q,
    country: cfg.country,
    language: cfg.language,
    startDate: isoDate(start),
    endDate: isoDate(end),
  });
  const res = await fetch(`${BASE}/GetKeywordStats?${params}`, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    // 401/403 → bad or unverified key; surface it on the first keyword only.
    if (res.status === 401 || res.status === 403) {
      throw new Error('Bing rejected the API key — check BING_WEBMASTER_API_KEY and that the site is verified in Bing Webmaster Tools.');
    }
    return null;
  }
  let json: any;
  try { json = await res.json(); } catch { return null; }
  const arr = json?.d;
  if (!Array.isArray(arr) || !arr.length) return 0; // no Bing data for this term

  // The series is monthly; take the latest point's impressions as the volume.
  let latest: any = null;
  let latestMs = -Infinity;
  for (const x of arr) {
    const ms = Number(String(x?.Date ?? '').replace(/[^0-9]/g, ''));
    if (Number.isFinite(ms) && ms > latestMs) { latestMs = ms; latest = x; }
  }
  const imp = latest?.Impressions;
  return typeof imp === 'number' ? imp : 0;
}

/** Simple promise pool so we never fire hundreds of Bing calls at once. */
async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Volume for a batch of keywords. Capped and throttled; returns a map of
 * keyword → monthly-ish impressions. The first auth failure throws so the caller
 * can show a clear setup message instead of silently returning nothing.
 */
export async function keywordVolume(keywords: string[], max = 60): Promise<Map<string, number>> {
  const cfg = bingConfig();
  if (!cfg) throw new Error('Bing is not configured');

  const terms = [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))].slice(0, max);
  const end = new Date();
  const start = new Date(end.getTime() - 365 * 86_400_000);

  const result = new Map<string, number>();
  const volumes = await pool(terms, 3, (q) => getKeywordStats(cfg, q, start, end));
  terms.forEach((q, idx) => {
    const v = volumes[idx];
    if (v != null) result.set(q, v);
  });
  return result;
}
