/** Polite HTTP with explicit redirect tracking and hard timeouts. */

export const UA =
  'Mozilla/5.0 (compatible; SEOCursorBot/0.1; +https://seocursor.app/bot) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

export type FetchResult = {
  url: string;          // final URL after redirects
  requestedUrl: string;
  status: number;
  ok: boolean;
  hops: number;
  redirectChain: string[];
  contentType: string;
  body: string | null;
  sizeBytes: number;
  responseMs: number;
  error?: string;
  headers: Record<string, string>;
};

const MAX_HOPS = 6;
const MAX_BODY = 3_000_000; // 3MB — anything larger is not a page we need to parse

/**
 * Follow redirects by hand so we can report the chain length, which is itself
 * an SEO finding. `method` is GET for pages and HEAD for link checks.
 */
export async function request(
  rawUrl: string,
  { method = 'GET', timeoutMs = 12_000, readBody = true }: { method?: 'GET' | 'HEAD'; timeoutMs?: number; readBody?: boolean } = {},
): Promise<FetchResult> {
  const started = Date.now();
  const chain: string[] = [];
  let url = rawUrl;
  let hops = 0;

  const base: FetchResult = {
    url: rawUrl, requestedUrl: rawUrl, status: 0, ok: false, hops: 0,
    redirectChain: [], contentType: '', body: null, sizeBytes: 0,
    responseMs: 0, headers: {},
  };

  while (hops <= MAX_HOPS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      });
    } catch (e) {
      clearTimeout(timer);
      const msg = (e as Error).name === 'AbortError' ? 'Timed out' : (e as Error).message;
      return { ...base, url, hops, redirectChain: chain, responseMs: Date.now() - started, error: msg };
    }
    clearTimeout(timer);

    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });

    // 3xx with a Location — record the hop and continue.
    if (res.status >= 300 && res.status < 400 && headers.location) {
      let next: string;
      try { next = new URL(headers.location, url).toString(); }
      catch { return { ...base, url, status: res.status, hops, redirectChain: chain, headers, responseMs: Date.now() - started, error: 'Bad redirect target' }; }
      chain.push(url);
      url = next;
      hops++;
      continue;
    }

    const contentType = headers['content-type'] ?? '';
    const isHtml = contentType.includes('html');
    let body: string | null = null;
    let sizeBytes = Number(headers['content-length'] ?? 0);

    if (method === 'GET' && readBody && isHtml) {
      try {
        const buf = await res.arrayBuffer();
        sizeBytes = buf.byteLength;
        if (buf.byteLength <= MAX_BODY) body = new TextDecoder('utf-8').decode(buf);
      } catch { /* body unreadable — status is still useful */ }
    } else if (method === 'GET') {
      // Not HTML. Drain so the socket is released, but do not parse.
      try { sizeBytes = (await res.arrayBuffer()).byteLength; } catch { /* ignore */ }
    }

    return {
      url,
      requestedUrl: rawUrl,
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      hops,
      redirectChain: chain,
      contentType,
      body,
      sizeBytes,
      responseMs: Date.now() - started,
      headers,
    };
  }

  return { ...base, url, hops, redirectChain: chain, responseMs: Date.now() - started, error: 'Too many redirects' };
}

/** Normalise a URL for dedupe: drop the fragment and common tracking params. */
export function normalise(raw: string, base?: string): string | null {
  let u: URL;
  try { u = new URL(raw, base); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  u.hash = '';
  for (const p of [...u.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|mc_cid|mc_eid|ref|_ga)/i.test(p)) u.searchParams.delete(p);
  }
  // Treat "/path" and "/path/" as one page, but never strip the root slash.
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
  return u.toString();
}

export const sameHost = (a: string, b: string): boolean => {
  try {
    const strip = (h: string) => h.replace(/^www\./, '').toLowerCase();
    return strip(new URL(a).hostname) === strip(new URL(b).hostname);
  } catch { return false; }
};

/** Path portion used as the page's display URL, e.g. "/pricing". */
export const pathOf = (u: string): string => {
  try {
    const x = new URL(u);
    return (x.pathname || '/') + (x.search || '');
  } catch { return u; }
};
