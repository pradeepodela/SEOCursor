/**
 * Google Ads — Keyword Planner historical metrics.
 *
 * A free source of real Google search volume and competition. It rides on the
 * same OAuth login as Search Console (the `adwords` scope), so the only extra
 * setup is a Google Ads developer token and the id of an Ads account to run the
 * lookups under. No ad spend is required for Keyword Planner data, though
 * without spend the volumes come back as rounded ranges rather than exact
 * numbers — which is fine for ranking keywords against each other.
 */

import { loadEnv } from './env';

export type AdsConfig = {
  developerToken: string;
  customerId: string;
  loginCustomerId: string | null;
  apiVersion: string;
};

/** Credentials come from the environment; the app runs fine without them. */
export function adsConfig(): AdsConfig | null {
  loadEnv();
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID?.replace(/\D/g, '');
  if (!developerToken || !customerId) return null;
  return {
    developerToken,
    customerId,
    loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/\D/g, '') || null,
    apiVersion: process.env.GOOGLE_ADS_API_VERSION?.trim() || 'v21',
  };
}

export const adsConfigured = (): boolean => adsConfig() !== null;

export type AdsMetric = {
  keyword: string;
  /** Average monthly searches. */
  volume: number;
  /** 0–1, from Google's competition index (0–100). */
  competition: number | null;
  /** Top-of-page bid, high estimate, in account currency. */
  cpc: number;
};

const COMPETITION_INDEX: Record<string, number> = { LOW: 20, MEDIUM: 50, HIGH: 85 };

function parseResults(json: any): AdsMetric[] {
  const out: AdsMetric[] = [];
  for (const r of json?.results ?? []) {
    const m = r?.keywordMetrics ?? {};
    const text = String(r?.text ?? '').trim().toLowerCase();
    if (!text) continue;
    const idx =
      m.competitionIndex != null ? Number(m.competitionIndex)
      : typeof m.competition === 'string' ? (COMPETITION_INDEX[m.competition] ?? null)
      : null;
    const highBid = m.highTopOfPageBidMicros != null ? Number(m.highTopOfPageBidMicros) / 1e6 : 0;
    out.push({
      keyword: text,
      volume: m.avgMonthlySearches != null ? Number(m.avgMonthlySearches) : 0,
      competition: idx == null || Number.isNaN(idx) ? null : Math.max(0, Math.min(1, idx / 100)),
      cpc: Number.isFinite(highBid) ? Number(highBid.toFixed(2)) : 0,
    });
  }
  return out;
}

/** Pull a Google Ads error message out of whatever shape the API returned. */
function adsError(status: number, json: any): string {
  const err = Array.isArray(json) ? json[0]?.error : json?.error;
  const detail = err?.details?.[0]?.errors?.[0]?.message;
  const msg = detail || err?.message;
  if (msg) return msg;
  if (status === 401) return 'Google rejected the token — reconnect Google with Keyword Planner permission.';
  if (status === 403) return 'Access denied — check the developer token and that the account can use the API.';
  if (status === 404) return 'Keyword Planner endpoint not found — the GOOGLE_ADS_API_VERSION may be out of date.';
  return `Google Ads request failed (HTTP ${status})`;
}

/**
 * Historical volume & competition for up to a few thousand keywords in one call.
 * `accessToken` is the site's Google token (from `accessTokenFor`).
 */
export async function historicalMetrics(
  accessToken: string,
  market: { geoTarget: number; languageId: number },
  keywords: string[],
): Promise<AdsMetric[]> {
  const cfg = adsConfig();
  if (!cfg) throw new Error('Google Ads is not configured');

  const terms = [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))].slice(0, 5000);
  if (!terms.length) return [];

  const url = `https://googleads.googleapis.com/${cfg.apiVersion}/customers/${cfg.customerId}:generateKeywordHistoricalMetrics`;
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
    'developer-token': cfg.developerToken,
    'content-type': 'application/json',
  };
  if (cfg.loginCustomerId) headers['login-customer-id'] = cfg.loginCustomerId;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      keywords: terms,
      geoTargetConstants: [`geoTargetConstants/${market.geoTarget}`],
      language: `languageConstants/${market.languageId}`,
      keywordPlanNetwork: 'GOOGLE_SEARCH',
      historicalMetricsOptions: { includeAverageCpc: true },
    }),
  });

  let json: any;
  try { json = await res.json(); } catch { json = null; }
  if (!res.ok) throw new Error(adsError(res.status, json));
  return parseResults(json);
}
