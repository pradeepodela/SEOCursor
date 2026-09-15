import { loadEnv } from './env';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from './db';

/**
 * Google Search Console — OAuth and the Search Analytics API.
 *
 * Read-only scope: we only ever look at performance data, never change anything
 * in the user's Google account.
 */

export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/webmasters/v3';

export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string };

/** Credentials come from the environment; the app runs fine without them. */
export function googleConfig(): GoogleConfig | null {
  loadEnv();
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:4330/api/google/callback';
  return { clientId, clientSecret, redirectUri };
}

export const isConfigured = (): boolean => googleConfig() !== null;

// ---------------------------------------------------------------- state signing

const stateSecret = () => process.env.GOOGLE_STATE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? 'dev-only-secret';

/** Sign the siteId into the OAuth state so the callback cannot be forged. */
export function signState(siteId: string): string {
  const payload = `${siteId}.${Date.now()}`;
  const mac = createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${mac}`;
}

export function verifyState(state: string): string | null {
  const [encoded, mac] = state.split('.');
  if (!encoded || !mac) return null;
  let payload: string;
  try { payload = Buffer.from(encoded, 'base64url').toString(); } catch { return null; }

  const expected = createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [siteId, ts] = payload.split('.');
  if (!siteId || !ts) return null;
  if (Date.now() - Number(ts) > 15 * 60_000) return null; // 15 minute window
  return siteId;
}

// ---------------------------------------------------------------- oauth

export function authUrl(siteId: string): string {
  const cfg = googleConfig();
  if (!cfg) throw new Error('Google OAuth is not configured');
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: GSC_SCOPE,
    access_type: 'offline',       // we need a refresh token
    prompt: 'consent',            // force one so re-connecting always works
    include_granted_scopes: 'true',
    state: signState(siteId),
  });
  return `${AUTH_URL}?${params}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
};

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const cfg = googleConfig();
  if (!cfg) throw new Error('Google OAuth is not configured');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? json.error ?? 'Token exchange failed');
  return json as TokenResponse;
}

async function refresh(refreshToken: string): Promise<TokenResponse> {
  const cfg = googleConfig();
  if (!cfg) throw new Error('Google OAuth is not configured');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? json.error ?? 'Token refresh failed');
  return json as TokenResponse;
}

/** A valid access token for this site, refreshing it if it has expired. */
export async function accessTokenFor(siteId: string): Promise<string> {
  const conn = await db.gscConnection.findUnique({ where: { siteId } });
  if (!conn) throw new Error('Search Console is not connected for this website');

  // Refresh a minute early rather than racing the expiry.
  if (conn.expiresAt.getTime() - 60_000 > Date.now()) return conn.accessToken;

  const t = await refresh(conn.refreshToken);
  const updated = await db.gscConnection.update({
    where: { siteId },
    data: {
      accessToken: t.access_token,
      expiresAt: new Date(Date.now() + t.expires_in * 1000),
      ...(t.refresh_token ? { refreshToken: t.refresh_token } : {}),
    },
  });
  return updated.accessToken;
}

/** Which email authorised this connection. */
export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.email ?? null;
  } catch { return null; }
}

// ---------------------------------------------------------------- search console

export type GscProperty = { siteUrl: string; permissionLevel: string };

export async function listProperties(accessToken: string): Promise<GscProperty[]> {
  const res = await fetch(`${API}/sites`, { headers: { authorization: `Bearer ${accessToken}` } });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? 'Could not list Search Console properties');
  return (json.siteEntry ?? []) as GscProperty[];
}

/**
 * Pick the property that matches a domain, preferring a domain property
 * (sc-domain:) since it covers every subdomain and protocol.
 */
export function matchProperty(properties: GscProperty[], domain: string): GscProperty | null {
  const bare = domain.replace(/^www\./, '').toLowerCase();
  const scoring = properties.map((p) => {
    const url = p.siteUrl.toLowerCase();
    let score = -1;
    if (url === `sc-domain:${bare}`) score = 100;
    else if (url.startsWith('sc-domain:') && url.slice(10) === bare) score = 100;
    else if (url.includes(`://${bare}`) || url.includes(`://www.${bare}`)) score = 60;
    else if (url.includes(bare)) score = 20;
    if (p.permissionLevel === 'siteOwner') score += 5;
    return { p, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return scoring[0]?.p ?? null;
}

export type SearchRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

export async function searchAnalytics(
  accessToken: string,
  propertyUrl: string,
  body: {
    startDate: string;
    endDate: string;
    dimensions: ('page' | 'query' | 'date' | 'country' | 'device')[];
    rowLimit?: number;
    startRow?: number;
  },
): Promise<SearchRow[]> {
  const res = await fetch(`${API}/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ rowLimit: 1000, ...body }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? 'Search Analytics request failed');
  return (json.rows ?? []) as SearchRow[];
}

/** YYYY-MM-DD, n days back. GSC data lags by ~2 days. */
export const daysAgo = (n: number): string =>
  new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
