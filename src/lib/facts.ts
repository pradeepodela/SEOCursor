/**
 * What the site actually says about itself.
 *
 * The draft pass used to receive a title, some headings and nothing else, and
 * was told to "be concrete, use specific numbers". With no facts supplied, the
 * only way to obey is to invent them — which is exactly what happened: a
 * fabricated pilot study, invented ROC-AUC figures, and an API endpoint the
 * product may not have. The fix is not a sterner prompt. It is giving the model
 * real material and forbidding anything outside it.
 */

import { db } from './db';

export type SiteFacts = {
  domain: string;
  /** Brand names to watch for in capability claims. */
  brand: string[];
  /** Every word the site itself uses — the boundary of what we can assert. */
  vocabulary: Set<string>;
  /** One plain sentence: what this product or site is. */
  identity: string;
  /** Real capabilities, taken from the site's own headings. */
  capabilities: string[];
  /** Page URL → what that page actually says. */
  evidence: { url: string; title: string; says: string }[];
  urls: Set<string>;
};

const clean = (s: string | null | undefined): string =>
  (s ?? '').replace(/\s+/g, ' ').trim();

/**
 * `limit` is a token budget as much as a relevance one. Grounding competes with
 * the article for room in the context window, and on a free-tier provider a
 * fact sheet that quotes every page will not leave space to write.
 */
export async function gatherFacts(siteId: string, limit = 12): Promise<SiteFacts> {
  const site = await db.site.findUniqueOrThrow({ where: { id: siteId } });

  const pages = await db.page.findMany({
    where: { siteId, crawledAt: { not: null }, statusCode: 200, indexable: true },
    orderBy: [{ depth: 'asc' }, { wordCount: 'desc' }],
    take: 200,
    select: { url: true, title: true, metaDesc: true, h1: true, h2s: true, textSample: true, wordCount: true },
  });

  const home = pages.find((p) => p.url === '/') ?? pages[0];
  const identity = [clean(home?.h1), clean(home?.metaDesc)].filter(Boolean).join(' — ')
    || clean(home?.title)
    || site.domain;

  // The site's own section headings are the closest thing to a feature list we
  // can get without guessing. Deduplicated, and stripped of navigation noise.
  const NOISE = /^(home|about|contact|blog|pricing|login|sign up|faq|features|resources|search|menu|more|next|previous|related|share|footer|newsletter|subscribe)$/i;
  const seen = new Set<string>();
  const capabilities: string[] = [];
  for (const p of pages) {
    for (const h of p.h2s ?? []) {
      const t = clean(h);
      const key = t.toLowerCase();
      if (!t || t.length < 8 || t.length > 110 || NOISE.test(t) || seen.has(key)) continue;
      seen.add(key);
      capabilities.push(t);
      if (capabilities.length >= 40) break;
    }
    if (capabilities.length >= 40) break;
  }

  const evidence = pages
    .filter((p) => clean(p.textSample).length > 80)
    .slice(0, limit)
    .map((p) => ({
      url: p.url,
      title: clean(p.title),
      says: clean(p.textSample).slice(0, 320),
    }));

  // Everything the site says, reduced to a word set. A capability claim using
  // words that appear nowhere here is describing a product we have no evidence
  // exists — which is how "member churn scores" and "surveys" got written about
  // a product that has neither.
  const vocabulary = new Set<string>();
  const corpus = [identity, ...capabilities, ...pages.flatMap((p) => [p.title, p.metaDesc ?? '', p.h1 ?? '', p.textSample ?? '', ...(p.h2s ?? [])])].join(' ');
  for (const w of corpus.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []) vocabulary.add(w.replace(/s$/, ''));

  const brand = [site.domain.split('.')[0].toLowerCase(), clean(site.name).toLowerCase()].filter((b) => b.length > 2);

  return { domain: site.domain, brand, vocabulary, identity, capabilities, evidence, urls: new Set(pages.map((p) => p.url)) };
}

/** The block handed to the model, and the only product detail it may use. */
export function renderFacts(facts: SiteFacts): string {
  const lines: string[] = [];
  lines.push(`WHAT ${facts.domain} IS: ${facts.identity}`);
  lines.push('');

  if (facts.capabilities.length) {
    lines.push('WHAT IT ACTUALLY DOES — taken from the site\'s own headings. These are the only');
    lines.push('product capabilities you may refer to:');
    for (const c of facts.capabilities.slice(0, 20)) lines.push(`  - ${c}`);
    lines.push('');
  }

  if (facts.evidence.length) {
    lines.push('WHAT ITS PAGES SAY — quote or paraphrase from here, never beyond it.');
    lines.push('Any number appearing here is sample data from a screenshot or marketing page.');
    lines.push('Describe what the screen shows, never the figures themselves:');
    for (const e of facts.evidence) {
      lines.push(`  ${e.url} — "${e.title}"`);
      lines.push(`    ${e.says}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Claims a reader would take as fact and we cannot support.
 *
 * Not a grammar check — it looks for the specific shapes of invention seen in
 * real output: statistics with no source, named studies that do not exist, and
 * API or field names for the customer's own product. Each hit is a sentence a
 * person should read before this gets published.
 */
export type Suspicion = { kind: string; quote: string };

export function findFabrication(body: string, facts: SiteFacts): Suspicion[] {
  const out: Suspicion[] = [];
  const sentences = body.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

  const CITED = /\b(according to|source:|reported by|per\s+[A-Z]|\[\d+\]|https?:\/\/)/i;

  for (const s of sentences) {
    if (s.length > 400) continue;

    // A percentage or multiplier presented as a result, with nothing behind it.
    if (/\b\d+(\.\d+)?\s?%|\b\d+(\.\d+)?x\b/.test(s) && !CITED.test(s)) {
      if (/\b(increase|decrease|reduc|improv|boost|lift|grew|grow|churn|conversion|retention|roi|revenue|accuracy|recall|precision|auc)\w*/i.test(s)) {
        out.push({ kind: 'unsourced statistic', quote: s });
        continue;
      }
    }

    // Research claims — but only where the sentence is genuinely citing
    // findings. "send a survey to members" is a product action, not a study,
    // and flagging it teaches people to ignore this list.
    if (/\b(a (study|survey|report|poll) (of|by|from|found|shows|suggests)|studies show|research (shows|suggests|finds)|our (data|research) shows|in a pilot|case study|benchmarks? show)\b/i.test(s) && !CITED.test(s)) {
      out.push({ kind: 'uncited research claim', quote: s });
      continue;
    }



    // Invented surface area on the customer's own product.
    const endpoint = s.match(/`?\/(api|v\d)\/[a-z0-9/_-]+`?/i);
    if (endpoint) {
      out.push({ kind: 'possible invented API detail', quote: s });
      continue;
    }

    // Figures lifted from screenshots and product demos on the site, which are
    // sample data. Repeating them as though they were the reader's own numbers
    // — or typical ones — is the quiet version of making them up.
    if (/[₹$€£]\s?[\d,]{3,}|\b\d{1,3}(,\d{2,3})+\b/.test(s)) {
      out.push({ kind: 'figure that may be sample data from a screenshot', quote: s });
      continue;
    }
  }

  // Named product surface: UI labels the draft puts in bold or code, and
  // navigation paths. These are concrete and checkable, unlike ordinary verbs —
  // an earlier version flagged words like "predict" and "reviewing", which
  // buried the real problems under noise nobody would read twice.
  const labels = new Map<string, string>();

  // Code spans and navigation paths only. Bold was tried and abandoned: it
  // marks emphasis far more often than product surface, so "Offer a special
  // discount" got reported as an invented feature. A list that flags five
  // harmless phrases per article is a list nobody reads.
  for (const m of body.matchAll(/`([^`\n]{3,60})`/g)) {
    const label = m[1].trim();
    if (!label || /^\d/.test(label)) continue;
    // Paths and identifiers are already covered by the endpoint rule; reporting
    // them twice makes the list look longer than the problem is.
    if (/[/\\_]|^\$/.test(label)) continue;
    labels.set(label.toLowerCase(), label);
  }
  for (const m of body.matchAll(/\b([A-Z][A-Za-z ]{2,24})\s*(?:→|->|>)\s*([A-Z][A-Za-z &-]{2,34})/g)) {
    labels.set(`${m[1]} → ${m[2]}`.toLowerCase(), `${m[1]} → ${m[2]}`);
  }

  for (const [, label] of labels) {
    // Every meaningful word of the label has to exist somewhere on the site.
    // Hyphenated compounds are checked part by part: a site that writes
    // "follow ups" still supports a draft writing "Follow-ups".
    const words = (label.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [])
      .flatMap((w) => w.split('-'))
      // Four characters or more: skips connectives like "and" and "for"
      // without needing a list of them.
      .filter((w) => w.length > 3)
      .map((w) => w.replace(/s$/, ''));
    if (!words.length) continue;
    const unknown = words.filter((w) => !facts.vocabulary.has(w));
    if (unknown.length) {
      out.push({ kind: `names something the site does not: "${label}"`, quote: unknown.join(', ') });
    }
  }

  // Internal links that point nowhere real.
  for (const m of body.matchAll(/\]\((\/[^)\s]*)\)/g)) {
    const url = m[1];
    if (!facts.urls.has(url)) out.push({ kind: 'link to a page that does not exist', quote: url });
  }

  return out.slice(0, 25);
}
