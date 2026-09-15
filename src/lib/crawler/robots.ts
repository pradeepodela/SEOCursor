import { request, normalise } from './http';

/**
 * Minimal robots.txt support: the directives that actually affect a crawl.
 * We honour the most specific matching group for our UA, falling back to `*`.
 */
export type Robots = {
  url: string;
  found: boolean;
  allow: string[];
  disallow: string[];
  sitemaps: string[];
  crawlDelayMs: number;
  raw: string;
};

export async function fetchRobots(origin: string): Promise<Robots> {
  const url = new URL('/robots.txt', origin).toString();
  const res = await request(url, { timeoutMs: 8000 });
  const empty: Robots = { url, found: false, allow: [], disallow: [], sitemaps: [], crawlDelayMs: 0, raw: '' };

  if (!res.ok || !res.body) {
    // Some servers return robots.txt as text/plain, which `request` does not buffer.
    const retry = res.status === 200 ? await rawText(url) : null;
    if (!retry) return empty;
    return parseRobots(url, retry);
  }
  return parseRobots(url, res.body);
}

async function rawText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'SEOCursorBot/0.1' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; }
}

export function parseRobots(url: string, raw: string): Robots {
  const out: Robots = { url, found: true, allow: [], disallow: [], sitemaps: [], crawlDelayMs: 0, raw: raw.slice(0, 20_000) };

  let applies = false;          // are we inside a group that matches us?
  let sawExactGroup = false;    // a group naming our bot beats the wildcard group

  for (const line of raw.split(/\r?\n/)) {
    const clean = line.split('#')[0].trim();
    if (!clean) continue;
    const idx = clean.indexOf(':');
    if (idx === -1) continue;
    const field = clean.slice(0, idx).trim().toLowerCase();
    const value = clean.slice(idx + 1).trim();

    if (field === 'sitemap') {
      const n = normalise(value);
      if (n) out.sitemaps.push(n);
      continue;
    }

    if (field === 'user-agent') {
      const ua = value.toLowerCase();
      if (ua.includes('seocursor')) { applies = true; sawExactGroup = true; out.allow = []; out.disallow = []; }
      else if (ua === '*' && !sawExactGroup) applies = true;
      else applies = false;
      continue;
    }

    if (!applies) continue;
    if (field === 'disallow' && value) out.disallow.push(value);
    else if (field === 'allow' && value) out.allow.push(value);
    else if (field === 'crawl-delay') {
      const n = Number(value);
      if (Number.isFinite(n)) out.crawlDelayMs = Math.min(n * 1000, 5000);
    }
  }
  return out;
}

const matches = (path: string, rule: string): boolean => {
  // robots.txt wildcards: * matches any run, $ anchors the end.
  const esc = rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const re = esc.endsWith('$') ? new RegExp('^' + esc.slice(0, -1) + '$') : new RegExp('^' + esc);
  return re.test(path);
};

export function isAllowed(robots: Robots, url: string): boolean {
  if (!robots.found) return true;
  let path: string;
  try { const u = new URL(url); path = u.pathname + u.search; } catch { return true; }

  // Longest matching rule wins; Allow beats Disallow at equal length.
  let best: { len: number; allow: boolean } | null = null;
  for (const rule of robots.disallow) {
    if (matches(path, rule) && (!best || rule.length > best.len)) best = { len: rule.length, allow: false };
  }
  for (const rule of robots.allow) {
    if (matches(path, rule) && (!best || rule.length >= best.len)) best = { len: rule.length, allow: true };
  }
  return best ? best.allow : true;
}

/** Pull URLs out of a sitemap, following sitemap-index files one level down. */
export async function fetchSitemapUrls(sitemapUrl: string, depth = 0): Promise<string[]> {
  if (depth > 1) return [];
  const xml = await rawText(sitemapUrl);
  if (!xml) return [];

  const isIndex = /<sitemapindex/i.test(xml);
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);

  if (isIndex) {
    const nested = await Promise.all(locs.slice(0, 5).map((u) => fetchSitemapUrls(u, depth + 1)));
    return nested.flat();
  }
  return locs.map((u) => normalise(u)).filter((u): u is string => !!u);
}

/** Try the declared sitemaps, then the conventional locations. */
export async function discoverSitemaps(origin: string, robots: Robots): Promise<{ urls: string[]; sources: string[] }> {
  const candidates = robots.sitemaps.length
    ? robots.sitemaps
    : [new URL('/sitemap.xml', origin).toString(), new URL('/sitemap_index.xml', origin).toString()];

  const sources: string[] = [];
  const urls = new Set<string>();
  for (const c of candidates.slice(0, 5)) {
    const found = await fetchSitemapUrls(c);
    if (found.length) {
      sources.push(c);
      found.forEach((u) => urls.add(u));
    }
    if (urls.size > 5000) break;
  }
  return { urls: [...urls], sources };
}
