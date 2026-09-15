import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import { normalise, sameHost } from './http';

export type ParsedLink = {
  href: string;        // absolute, normalised
  anchorText: string;
  rel: string | null;
  internal: boolean;
  nofollow: boolean;
};

export type ParsedPage = {
  title: string;
  titleLength: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  h1s: string[];
  h2s: string[];
  canonical: string | null;
  robotsMeta: string | null;
  noindex: boolean;
  lang: string | null;
  hasViewport: boolean;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  schemaTypes: string[];
  wordCount: number;
  textSample: string;
  contentHash: string;
  images: { src: string; alt: string | null }[];
  imagesMissingAlt: number;
  links: ParsedLink[];
  internalLinks: number;
  externalLinks: number;
};

/** Elements whose text is never page content. */
const STRIP = 'script, style, noscript, template, svg, iframe, nav, header, footer, aside';

export function parseHtml(html: string, pageUrl: string): ParsedPage {
  const $ = cheerio.load(html);

  const title = ($('head > title').first().text() || '').trim();
  const metaDescription = attr($, 'meta[name="description"]') ?? attr($, 'meta[property="og:description"]');
  const robotsMeta = attr($, 'meta[name="robots"]') ?? attr($, 'meta[name="googlebot"]');
  const canonicalRaw = $('link[rel="canonical"]').first().attr('href') ?? null;

  const h1s = $('h1').map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const h2s = $('h2').map((_, el) => $(el).text().trim()).get().filter(Boolean);

  // Schema.org types from JSON-LD plus any microdata itemtype.
  const schemaTypes = new Set<string>();
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      const walk = (node: unknown): void => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (node && typeof node === 'object') {
          const t = (node as Record<string, unknown>)['@type'];
          if (typeof t === 'string') schemaTypes.add(t);
          else if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && schemaTypes.add(x));
          const graph = (node as Record<string, unknown>)['@graph'];
          if (graph) walk(graph);
        }
      };
      walk(JSON.parse(raw));
    } catch { /* malformed JSON-LD is itself worth flagging, handled in issues */ }
  });
  $('[itemtype]').each((_, el) => {
    const t = $(el).attr('itemtype');
    if (t) schemaTypes.add(t.split('/').pop() ?? t);
  });

  // Body text with chrome removed.
  const $body = cheerio.load(html);
  $body(STRIP).remove();
  const text = $body('body').text().replace(/\s+/g, ' ').trim();
  const words = text ? text.split(' ').filter((w) => /[a-z0-9]/i.test(w)) : [];

  // Images
  const images = $('img').map((_, el) => {
    const src = $(el).attr('src') ?? $(el).attr('data-src') ?? '';
    const alt = $(el).attr('alt');
    return { src, alt: alt === undefined ? null : alt };
  }).get();

  // Links
  const seen = new Set<string>();
  const links: ParsedLink[] = [];
  $('a[href]').each((_, el) => {
    const raw = ($(el).attr('href') ?? '').trim();
    if (!raw || /^(mailto:|tel:|javascript:|#|data:)/i.test(raw)) return;
    const abs = normalise(raw, pageUrl);
    if (!abs) return;
    const rel = $(el).attr('rel') ?? null;
    const key = abs + '|' + (rel ?? '');
    if (seen.has(key)) return;
    seen.add(key);
    links.push({
      href: abs,
      anchorText: $(el).text().replace(/\s+/g, ' ').trim().slice(0, 200),
      rel,
      internal: sameHost(abs, pageUrl),
      nofollow: !!rel && /nofollow/i.test(rel),
    });
  });

  const robotsLower = (robotsMeta ?? '').toLowerCase();

  return {
    title,
    titleLength: title.length,
    metaDescription,
    metaDescriptionLength: metaDescription?.length ?? 0,
    h1s,
    h2s,
    canonical: canonicalRaw ? normalise(canonicalRaw, pageUrl) : null,
    robotsMeta,
    noindex: robotsLower.includes('noindex'),
    lang: $('html').attr('lang') ?? null,
    hasViewport: $('meta[name="viewport"]').length > 0,
    ogTitle: attr($, 'meta[property="og:title"]'),
    ogDescription: attr($, 'meta[property="og:description"]'),
    ogImage: attr($, 'meta[property="og:image"]'),
    schemaTypes: [...schemaTypes],
    wordCount: words.length,
    textSample: text.slice(0, 400),
    contentHash: createHash('sha1').update(words.join(' ')).digest('hex').slice(0, 16),
    images,
    imagesMissingAlt: images.filter((i) => i.alt === null || i.alt.trim() === '').length,
    links,
    internalLinks: links.filter((l) => l.internal).length,
    externalLinks: links.filter((l) => !l.internal).length,
  };
}

const attr = ($: cheerio.CheerioAPI, sel: string): string | null => {
  const v = $(sel).first().attr('content');
  return v === undefined ? null : v.trim();
};

/** Best guess at what the page is about, used until GSC data arrives. */
export function inferTopic(p: ParsedPage, path: string): string | null {
  const fromH1 = p.h1s[0];
  if (fromH1 && fromH1.length < 70) return fromH1;
  if (p.title) return p.title.split(/[|–—\-]/)[0].trim().slice(0, 70) || null;
  const seg = path.split('/').filter(Boolean).pop();
  return seg ? seg.replace(/[-_]/g, ' ') : null;
}
