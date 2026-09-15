import { db } from '../db';
import type { Robots } from './robots';
import type { Severity } from '@prisma/client';

/**
 * Turn observed crawl data into findings.
 *
 * Every rule here reads only what the crawler actually measured, and each one
 * carries a stable `code` so a re-crawl replaces its own previous findings
 * rather than piling duplicates up.
 */

type Finding = {
  code: string;
  title: string;
  category: string;
  severity: Severity;
  affectedUrl: string | null;
  affectedCount: number;
  samples: string[];
  whyItMatters: string;
  recommendedAction: string;
  aiFixable: boolean;
};

export async function deriveIssues(
  siteId: string,
  robots: Robots,
  opts: { hitCap?: boolean } = {},
): Promise<number> {
  const [pages, links] = await Promise.all([
    db.page.findMany({ where: { siteId, crawledAt: { not: null } } }),
    db.link.findMany({ where: { siteId } }),
  ]);

  const html = pages.filter((p) => (p.contentType ?? '').includes('html') || p.statusCode === 200);
  const indexable = html.filter((p) => p.indexable && p.statusCode === 200);
  const f: Finding[] = [];

  const add = (x: Finding) => { if (x.affectedCount > 0) f.push(x); };
  const urls = (rows: { url: string }[], n = 5) => rows.slice(0, n).map((r) => r.url);

  // ---------------------------------------------------------------- broken links
  const brokenChecked = links.filter((l) => l.verdict === 'broken');
  const brokenInternal = brokenChecked.filter((l) => l.isInternal);
  const brokenExternal = brokenChecked.filter((l) => !l.isInternal);
  const unverified = links.filter((l) => l.verdict === 'blocked' || l.verdict === 'unreachable');

  add({
    code: 'broken-internal-links',
    title: `${brokenInternal.length} broken internal link${brokenInternal.length === 1 ? '' : 's'}`,
    category: 'Technical',
    severity: 'CRITICAL',
    affectedUrl: brokenInternal[0]?.fromUrl ?? null,
    affectedCount: brokenInternal.length,
    samples: [...new Set(brokenInternal.map((l) => `${l.toUrl} (${l.statusCode || l.error}) — linked from ${l.fromUrl}`))].slice(0, 8),
    whyItMatters:
      'Internal links that return an error waste crawl budget, strand any authority they were passing, and send visitors to a dead end. Google treats a site with many of these as lower quality.',
    recommendedAction: 'Update each link to its correct destination, or remove it if the target is genuinely gone.',
    aiFixable: false,
  });

  add({
    code: 'broken-external-links',
    title: `${brokenExternal.length} broken external link${brokenExternal.length === 1 ? '' : 's'}`,
    category: 'Technical',
    severity: 'WARNING',
    affectedUrl: brokenExternal[0]?.fromUrl ?? null,
    affectedCount: brokenExternal.length,
    samples: [...new Set(brokenExternal.map((l) => `${l.toUrl} (${l.statusCode || l.error}) — linked from ${l.fromUrl}`))].slice(0, 8),
    whyItMatters:
      'Links to pages that no longer exist are a visible quality signal to readers, and dead outbound references date your content.',
    recommendedAction: 'Point each link at a live equivalent, or unlink the text.',
    aiFixable: false,
  });

  add({
    code: 'unverifiable-links',
    title: `${unverified.length} link${unverified.length === 1 ? '' : 's'} could not be verified`,
    category: 'Technical',
    severity: 'WARNING',
    affectedUrl: unverified[0]?.fromUrl ?? null,
    affectedCount: unverified.length,
    samples: [...new Set(unverified.map((l) => `${l.toUrl} — ${l.verdict === 'blocked' ? `blocked (${l.statusCode})` : l.error ?? 'unreachable'}`))].slice(0, 8),
    whyItMatters:
      'These targets answered with bot protection or did not respond to us. That usually means the link is fine for a human visitor, so we have not counted them as broken — but they are worth a manual glance.',
    recommendedAction: 'Open a few in a browser to confirm they still resolve.',
    aiFixable: false,
  });

  // ---------------------------------------------------------------- error pages
  const errorPages = html.filter((p) => (p.statusCode ?? 0) >= 400);
  add({
    code: 'error-pages',
    title: `${errorPages.length} page${errorPages.length === 1 ? '' : 's'} returning an error`,
    category: 'Technical',
    severity: 'CRITICAL',
    affectedUrl: errorPages[0]?.url ?? null,
    affectedCount: errorPages.length,
    samples: errorPages.slice(0, 8).map((p) => `${p.url} — ${p.statusCode}`),
    whyItMatters: 'These URLs are reachable from your own site but return an error, so they cannot rank and they consume crawl budget.',
    recommendedAction: 'Restore the page, or redirect the URL to the closest live equivalent.',
    aiFixable: false,
  });

  // ---------------------------------------------------------------- redirects
  const redirected = html.filter((p) => p.redirectHops > 0);
  const chains = redirected.filter((p) => p.redirectHops > 1);
  add({
    code: 'redirect-chains',
    title: `${chains.length} redirect chain${chains.length === 1 ? '' : 's'}`,
    category: 'Technical',
    severity: 'WARNING',
    affectedUrl: chains[0]?.url ?? null,
    affectedCount: chains.length,
    samples: chains.slice(0, 6).map((p) => `${p.url} — ${p.redirectHops} hops`),
    whyItMatters: 'Each extra hop slows the page, loses a little of the signal being passed, and gives Google another reason to stop following.',
    recommendedAction: 'Point the first URL directly at the final destination.',
    aiFixable: false,
  });

  const internalRedirects = links.filter((l) => l.isInternal && l.redirectTo);
  add({
    code: 'links-to-redirects',
    title: `${internalRedirects.length} internal link${internalRedirects.length === 1 ? '' : 's'} point at a redirect`,
    category: 'Internal Linking',
    severity: 'WARNING',
    affectedUrl: internalRedirects[0]?.fromUrl ?? null,
    affectedCount: internalRedirects.length,
    samples: [...new Set(internalRedirects.map((l) => `${l.toUrl} → ${l.redirectTo}`))].slice(0, 6),
    whyItMatters: 'Linking through a redirect adds a hop for every visitor and dilutes the authority the link passes.',
    recommendedAction: 'Update these links to the final URL.',
    aiFixable: true,
  });

  // ---------------------------------------------------------------- titles
  const noTitle = indexable.filter((p) => !p.title || p.title === '(no title)');
  add({
    code: 'missing-title',
    title: `${noTitle.length} page${noTitle.length === 1 ? '' : 's'} missing a title tag`,
    category: 'Metadata', severity: 'CRITICAL',
    affectedUrl: noTitle[0]?.url ?? null, affectedCount: noTitle.length, samples: urls(noTitle, 8),
    whyItMatters: 'The title is the strongest on-page relevance signal and the headline of your search result. Without it Google invents one.',
    recommendedAction: 'Write a unique 50–60 character title describing the page intent.',
    aiFixable: true,
  });

  const longTitle = indexable.filter((p) => p.title.length > 60);
  add({
    code: 'title-too-long',
    title: `${longTitle.length} title${longTitle.length === 1 ? '' : 's'} over 60 characters`,
    category: 'Metadata', severity: 'WARNING',
    affectedUrl: longTitle[0]?.url ?? null, affectedCount: longTitle.length,
    samples: longTitle.slice(0, 6).map((p) => `${p.url} — ${p.title.length} chars`),
    whyItMatters: 'Titles past roughly 60 characters get truncated in results, so the end of your message never gets read.',
    recommendedAction: 'Front-load the distinctive words and trim to under 60 characters.',
    aiFixable: true,
  });

  const dupTitles = groupDuplicates(indexable.filter((p) => p.title), (p) => p.title.trim().toLowerCase());
  add({
    code: 'duplicate-titles',
    title: `${dupTitles.total} page${dupTitles.total === 1 ? '' : 's'} share a duplicate title`,
    category: 'Metadata', severity: 'CRITICAL',
    affectedUrl: dupTitles.sampleUrl, affectedCount: dupTitles.total, samples: dupTitles.samples,
    whyItMatters: 'When several pages carry the same title, Google has no signal for which one to rank and often picks the weakest.',
    recommendedAction: 'Give each page a distinct, intent-matched title.',
    aiFixable: true,
  });

  // ---------------------------------------------------------------- descriptions
  const noDesc = indexable.filter((p) => !p.metaDesc);
  add({
    code: 'missing-meta-description',
    title: `${noDesc.length} page${noDesc.length === 1 ? '' : 's'} missing a meta description`,
    category: 'Metadata', severity: 'WARNING',
    affectedUrl: noDesc[0]?.url ?? null, affectedCount: noDesc.length, samples: urls(noDesc, 8),
    whyItMatters: 'Google generates a snippet from body copy when no description exists, which usually reads worse and lowers click-through.',
    recommendedAction: 'Write a 150-character description per page that states the benefit and invites the click.',
    aiFixable: true,
  });

  const dupDesc = groupDuplicates(indexable.filter((p) => p.metaDesc), (p) => (p.metaDesc ?? '').trim().toLowerCase());
  add({
    code: 'duplicate-meta-description',
    title: `${dupDesc.total} page${dupDesc.total === 1 ? '' : 's'} share a meta description`,
    category: 'Metadata', severity: 'WARNING',
    affectedUrl: dupDesc.sampleUrl, affectedCount: dupDesc.total, samples: dupDesc.samples,
    whyItMatters: 'Identical descriptions suggest near-identical pages and waste the one piece of copy you fully control in the result.',
    recommendedAction: 'Rewrite each description around what makes that page different.',
    aiFixable: true,
  });

  // ---------------------------------------------------------------- headings
  const noH1 = indexable.filter((p) => p.h1Count === 0);
  add({
    code: 'missing-h1', title: `${noH1.length} page${noH1.length === 1 ? '' : 's'} with no H1`,
    category: 'On-page', severity: 'WARNING',
    affectedUrl: noH1[0]?.url ?? null, affectedCount: noH1.length, samples: urls(noH1, 8),
    whyItMatters: 'The H1 tells both readers and crawlers what the page is about before anything else is parsed.',
    recommendedAction: 'Add a single descriptive H1 to each page.',
    aiFixable: true,
  });

  const multiH1 = indexable.filter((p) => p.h1Count > 1);
  add({
    code: 'multiple-h1', title: `${multiH1.length} page${multiH1.length === 1 ? '' : 's'} with more than one H1`,
    category: 'On-page', severity: 'WARNING',
    affectedUrl: multiH1[0]?.url ?? null, affectedCount: multiH1.length,
    samples: multiH1.slice(0, 6).map((p) => `${p.url} — ${p.h1Count} H1s`),
    whyItMatters: 'Multiple H1s split the page\'s main topic signal across competing headings.',
    recommendedAction: 'Keep one H1 and demote the rest to H2.',
    aiFixable: true,
  });

  // ---------------------------------------------------------------- content
  const thin = indexable.filter((p) => p.wordCount > 0 && p.wordCount < 300);
  add({
    code: 'thin-content', title: `${thin.length} page${thin.length === 1 ? '' : 's'} under 300 words`,
    category: 'Content', severity: 'WARNING',
    affectedUrl: thin[0]?.url ?? null, affectedCount: thin.length,
    samples: thin.slice(0, 8).map((p) => `${p.url} — ${p.wordCount} words`),
    whyItMatters: 'Pages this short rarely have enough substance to satisfy a query, and in volume they drag down how the whole site is assessed.',
    recommendedAction: 'Expand each page to cover the question it targets, or consolidate it into a stronger page.',
    aiFixable: true,
  });

  const dupContent = groupDuplicates(indexable.filter((p) => p.contentHash && p.wordCount > 50), (p) => p.contentHash ?? '');
  add({
    code: 'duplicate-content', title: `${dupContent.total} page${dupContent.total === 1 ? '' : 's'} with duplicate body content`,
    category: 'Content', severity: 'CRITICAL',
    affectedUrl: dupContent.sampleUrl, affectedCount: dupContent.total, samples: dupContent.samples,
    whyItMatters: 'Byte-identical content across URLs forces Google to choose one and discard the rest, splitting any signals between them.',
    recommendedAction: 'Consolidate to one URL and canonicalise or redirect the duplicates.',
    aiFixable: false,
  });

  // ---------------------------------------------------------------- canonical / indexing
  const noCanonical = indexable.filter((p) => !p.canonical);
  add({
    code: 'missing-canonical', title: `${noCanonical.length} page${noCanonical.length === 1 ? '' : 's'} without a canonical tag`,
    category: 'Indexing', severity: 'WARNING',
    affectedUrl: noCanonical[0]?.url ?? null, affectedCount: noCanonical.length, samples: urls(noCanonical, 8),
    whyItMatters: 'Without a canonical, parameter and trailing-slash variants of the same page can be indexed separately and compete with each other.',
    recommendedAction: 'Add a self-referencing canonical to every indexable page.',
    aiFixable: true,
  });

  const noindexed = html.filter((p) => p.robotsMeta && p.robotsMeta.toLowerCase().includes('noindex'));
  add({
    code: 'noindex-pages', title: `${noindexed.length} page${noindexed.length === 1 ? '' : 's'} set to noindex`,
    category: 'Indexing', severity: 'WARNING',
    affectedUrl: noindexed[0]?.url ?? null, affectedCount: noindexed.length, samples: urls(noindexed, 8),
    whyItMatters: 'These pages are excluded from search entirely. That is sometimes deliberate and sometimes an accident left over from staging.',
    recommendedAction: 'Confirm each one is meant to be hidden; remove the directive from any that should rank.',
    aiFixable: false,
  });

  // ---------------------------------------------------------------- internal linking
  // A capped crawl has not seen every linking page, so inbound counts are a
  // lower bound and would produce false orphans. Only report when complete.
  const orphans = opts.hitCap ? [] : indexable.filter((p) => p.inboundLinks === 0 && p.depth > 0);
  add({
    code: 'orphan-pages', title: `${orphans.length} page${orphans.length === 1 ? '' : 's'} with no internal links pointing to them`,
    category: 'Internal Linking', severity: 'WARNING',
    affectedUrl: orphans[0]?.url ?? null, affectedCount: orphans.length, samples: urls(orphans, 8),
    whyItMatters: 'Orphaned pages get almost no crawl priority and inherit no authority from the rest of the site, so they rarely rank however good they are.',
    recommendedAction: 'Link to each from a relevant, well-linked page.',
    aiFixable: true,
  });

  const weak = opts.hitCap ? [] : indexable.filter((p) => p.inboundLinks > 0 && p.inboundLinks < 3 && p.depth > 0);
  add({
    code: 'weakly-linked', title: `${weak.length} page${weak.length === 1 ? '' : 's'} with fewer than 3 internal links`,
    category: 'Internal Linking', severity: 'WARNING',
    affectedUrl: weak[0]?.url ?? null, affectedCount: weak.length,
    samples: weak.slice(0, 8).map((p) => `${p.url} — ${p.inboundLinks} inbound`),
    whyItMatters: 'Thinly-linked pages sit at the edge of your site structure, which caps how much authority can reach them.',
    recommendedAction: 'Add contextual links from your highest-authority related pages.',
    aiFixable: true,
  });

  const deep = indexable.filter((p) => p.depth >= 4);
  add({
    code: 'deep-pages', title: `${deep.length} page${deep.length === 1 ? '' : 's'} more than 3 clicks from the homepage`,
    category: 'Internal Linking', severity: 'WARNING',
    affectedUrl: deep[0]?.url ?? null, affectedCount: deep.length,
    samples: deep.slice(0, 6).map((p) => `${p.url} — depth ${p.depth}`),
    whyItMatters: 'Crawl priority falls off sharply with depth. Pages buried this far down are checked less often and rank worse.',
    recommendedAction: 'Flatten the structure, or link these from a hub page nearer the top.',
    aiFixable: false,
  });

  // ---------------------------------------------------------------- images
  const missingAlt = indexable.filter((p) => p.imagesMissingAlt > 0);
  const altTotal = missingAlt.reduce((n, p) => n + p.imagesMissingAlt, 0);
  add({
    code: 'images-missing-alt', title: `${altTotal} image${altTotal === 1 ? '' : 's'} missing alt text`,
    category: 'Images', severity: 'WARNING',
    affectedUrl: missingAlt[0]?.url ?? null, affectedCount: altTotal,
    samples: missingAlt.slice(0, 6).map((p) => `${p.url} — ${p.imagesMissingAlt} of ${p.imageCount}`),
    whyItMatters: 'Images without alt text are invisible to image search and to anyone using a screen reader.',
    recommendedAction: 'Write descriptive alt text for each image.',
    aiFixable: true,
  });

  // ---------------------------------------------------------------- schema & social
  const noSchema = indexable.filter((p) => p.schemaTypes.length === 0);
  add({
    code: 'missing-schema', title: `${noSchema.length} page${noSchema.length === 1 ? '' : 's'} with no structured data`,
    category: 'Schema', severity: 'WARNING',
    affectedUrl: noSchema[0]?.url ?? null, affectedCount: noSchema.length, samples: urls(noSchema, 8),
    whyItMatters: 'Without structured data these pages cannot qualify for rich results, which take up more space in the SERP than a plain listing.',
    recommendedAction: 'Add the JSON-LD type that matches each page — Article, Product, FAQPage or Organization.',
    aiFixable: true,
  });

  const noOg = indexable.filter((p) => !p.ogImage);
  add({
    code: 'missing-og-image', title: `${noOg.length} page${noOg.length === 1 ? '' : 's'} with no social preview image`,
    category: 'Metadata', severity: 'WARNING',
    affectedUrl: noOg[0]?.url ?? null, affectedCount: noOg.length, samples: urls(noOg, 8),
    whyItMatters: 'Shares of these pages render without a preview image, which measurably reduces referral click-through.',
    recommendedAction: 'Add a default og:image and per-page overrides for your most-shared pages.',
    aiFixable: true,
  });

  // ---------------------------------------------------------------- mobile & speed
  const noViewport = indexable.filter((p) => !p.hasViewport);
  add({
    code: 'missing-viewport', title: `${noViewport.length} page${noViewport.length === 1 ? '' : 's'} without a viewport meta tag`,
    category: 'Performance', severity: 'CRITICAL',
    affectedUrl: noViewport[0]?.url ?? null, affectedCount: noViewport.length, samples: urls(noViewport, 8),
    whyItMatters: 'Without a viewport declaration the page renders at desktop width on phones. Google indexes mobile-first, so this affects every ranking.',
    recommendedAction: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the document head.',
    aiFixable: true,
  });

  const slow = html.filter((p) => (p.responseMs ?? 0) > 1500);
  add({
    code: 'slow-pages', title: `${slow.length} page${slow.length === 1 ? '' : 's'} responding slower than 1.5s`,
    category: 'Performance', severity: 'WARNING',
    affectedUrl: slow[0]?.url ?? null, affectedCount: slow.length,
    samples: slow.slice(0, 6).map((p) => `${p.url} — ${p.responseMs}ms`),
    whyItMatters: 'Server response time is the floor under every Core Web Vital. Nothing else you optimise can beat it.',
    recommendedAction: 'Investigate server rendering and caching for these routes.',
    aiFixable: false,
  });

  // ---------------------------------------------------------------- site level
  if (!robots.found) {
    f.push({
      code: 'no-robots-txt', title: 'No robots.txt found', category: 'Technical', severity: 'WARNING',
      affectedUrl: '/robots.txt', affectedCount: 1, samples: [],
      whyItMatters: 'Without robots.txt you cannot point crawlers at your sitemap or keep them out of low-value URLs.',
      recommendedAction: 'Add a robots.txt that allows crawling and declares your sitemap.',
      aiFixable: true,
    });
  }

  const site = await db.site.findUnique({ where: { id: siteId } });
  if (site && site.sitemapUrls.length === 0) {
    f.push({
      code: 'no-sitemap', title: 'No XML sitemap found', category: 'Indexing', severity: 'CRITICAL',
      affectedUrl: '/sitemap.xml', affectedCount: 1, samples: [],
      whyItMatters: 'A sitemap is how you tell Google which URLs matter and when they changed. Without one, discovery depends entirely on internal links.',
      recommendedAction: 'Generate an XML sitemap and reference it from robots.txt.',
      aiFixable: true,
    });
  }

  // ---------------------------------------------------------------- persist
  await db.auditIssue.deleteMany({ where: { siteId, fromCrawl: true } });

  const pageByUrl = new Map(pages.map((p) => [p.url, p.id]));
  await db.auditIssue.createMany({
    data: f.map((x) => ({
      siteId,
      code: x.code,
      title: x.title,
      category: x.category,
      severity: x.severity,
      affectedUrl: x.affectedUrl,
      affectedCount: x.affectedCount,
      samples: x.samples,
      whyItMatters: x.whyItMatters,
      recommendedAction: x.recommendedAction,
      aiFixable: x.aiFixable,
      fromCrawl: true,
      pageId: x.affectedUrl ? pageByUrl.get(x.affectedUrl) ?? null : null,
    })),
  });

  await scoreSite(siteId, pages, links);
  return f.length;
}

/** Group rows by a key and report how many sit in a group larger than one. */
function groupDuplicates<T extends { url: string }>(rows: T[], key: (r: T) => string) {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    (map.get(k) ?? map.set(k, []).get(k)!).push(r);
  }
  const dupes = [...map.values()].filter((g) => g.length > 1);
  return {
    total: dupes.reduce((n, g) => n + g.length, 0),
    sampleUrl: dupes[0]?.[0]?.url ?? null,
    samples: dupes.slice(0, 4).map((g) => g.map((r) => r.url).join('  ·  ')),
  };
}

/** Health scores computed from measurements, not assigned. */
async function scoreSite(
  siteId: string,
  pages: { statusCode: number | null; redirectHops: number; responseMs: number | null; indexable: boolean; canonical: string | null; title: string; metaDesc: string | null; h1Count: number; wordCount: number; schemaTypes: string[]; imageCount: number; imagesMissingAlt: number; hasViewport: boolean; inboundLinks: number; depth: number }[],
  links: { checkedAt: Date | null; ok: boolean; verdict: string; isInternal: boolean }[],
) {
  const n = Math.max(pages.length, 1);
  const pct = (count: number) => Math.round((count / n) * 100);
  const score = (goodPct: number) => Math.max(0, Math.min(100, Math.round(goodPct)));

  const checked = links.filter((l) => l.verdict !== 'unchecked');
  const brokenRate = checked.length ? checked.filter((l) => l.verdict === 'broken').length / checked.length : 0;

  const technical = score(
    100
    - pct(pages.filter((p) => (p.statusCode ?? 0) >= 400).length) * 2
    - pct(pages.filter((p) => p.redirectHops > 1).length)
    - brokenRate * 100
    - pct(pages.filter((p) => !p.hasViewport).length),
  );

  const onPage = score(
    100
    - pct(pages.filter((p) => !p.title || p.title.length > 60 || p.title.length < 15).length) * 0.8
    - pct(pages.filter((p) => !p.metaDesc).length) * 0.6
    - pct(pages.filter((p) => p.h1Count !== 1).length) * 0.6,
  );

  const content = score(
    100
    - pct(pages.filter((p) => p.wordCount < 300).length) * 1.2
    - pct(pages.filter((p) => p.wordCount < 150).length) * 0.6,
  );

  const ux = score(
    100
    - pct(pages.filter((p) => (p.responseMs ?? 0) > 1500).length) * 1.2
    - pct(pages.filter((p) => !p.hasViewport).length) * 2,
  );

  // Backlinks are not observable from a crawl — leave the existing value alone.
  const existing = await db.site.findUnique({ where: { id: siteId } });
  const backlinks = existing?.backlinkScore ?? 0;

  const parts = [technical, onPage, content, ux].filter((x) => Number.isFinite(x));
  const health = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);

  await db.site.update({
    where: { id: siteId },
    data: {
      technicalScore: technical,
      onPageScore: onPage,
      contentScore: content,
      uxScore: ux,
      healthScore: health,
    },
  });
}
