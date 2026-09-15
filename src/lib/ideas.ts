import { z } from 'zod';
import { db } from './db';
import { completeJson, type LlmUsage } from './llm';
import type { IdeaSource } from '@prisma/client';

/**
 * Blog title generation.
 *
 * The model is never asked "what should this site write about?" in the
 * abstract. It is handed the actual crawl and the actual Search Console rows,
 * and required to tie every suggestion back to one of them. Ungrounded titles
 * are the failure mode here — they look plausible and are worth nothing.
 */

const IdeaSchema = z.object({
  title: z.string().trim().min(10).max(160),
  angle: z.string().trim().max(400).optional().default(''),
  targetQuery: z.string().trim().max(160).optional().default(''),
  rationale: z.string().trim().min(10).max(800),
  evidenceRef: z.string().trim().max(120).optional().default(''),
  score: z.coerce.number().int().min(0).max(100).default(50),
});

const ResponseSchema = z.object({ ideas: z.array(IdeaSchema).min(1).max(40) });

export type SiteContext = {
  domain: string;
  summary: string;
  pages: { url: string; title: string; topic: string | null; words: number }[];
  nearMiss: { query: string; impressions: number; clicks: number; position: number; url: string | null }[];
  noClicks: { query: string; impressions: number; position: number }[];
  winning: { query: string; impressions: number; clicks: number; position: number }[];
  thinPages: { url: string; title: string; words: number }[];
  /** Market data: demand and difficulty for terms, ranked or not. */
  research: { keyword: string; volume: number; difficulty: number; cpc: number; position: number | null; intent: string; opportunity: string }[];
  market: string | null;
  hasGsc: boolean;
};

/** Everything the model is allowed to reason from. */
export async function buildContext(siteId: string): Promise<SiteContext> {
  const [site, pages, keywords, provider, researched] = await Promise.all([
    db.site.findUniqueOrThrow({ where: { id: siteId } }),
    db.page.findMany({
      where: { siteId, crawledAt: { not: null }, statusCode: 200 },
      orderBy: [{ impressions: 'desc' }, { depth: 'asc' }],
      take: 120,
    }),
    db.keyword.findMany({ where: { siteId }, orderBy: { impressions: 'desc' }, take: 400 }),
    db.dataForSeoConnection.findUnique({ where: { siteId } }),
    // Demand data, best opportunities first — see briefingKeywords for the order.
    db.keyword.findMany({
      where: { siteId, volume: { gt: 0 } },
      orderBy: [{ opportunity: 'asc' }, { volume: 'desc' }],
      take: 45,
    }),
  ]);

  const home = pages.find((p) => p.url === '/');
  const summary = [home?.title, home?.metaDesc, home?.h1].filter(Boolean).join(' — ') || site.domain;

  const pageById = new Map(pages.map((p) => [p.id, p]));

  return {
    domain: site.domain,
    summary,
    pages: pages.slice(0, 80).map((p) => ({
      url: p.url,
      title: p.title,
      topic: p.primaryTopic,
      words: p.wordCount,
    })),
    nearMiss: keywords
      .filter((k) => k.position !== null && k.position >= 8 && k.position <= 25 && k.impressions >= 20)
      .slice(0, 40)
      .map((k) => ({
        query: k.keyword,
        impressions: k.impressions,
        clicks: k.clicks,
        position: k.position ?? 0,
        url: k.pageId ? pageById.get(k.pageId)?.url ?? null : null,
      })),
    noClicks: keywords
      .filter((k) => k.clicks === 0 && k.impressions >= 40)
      .slice(0, 40)
      .map((k) => ({ query: k.keyword, impressions: k.impressions, position: k.position ?? 0 })),
    winning: keywords
      .filter((k) => k.position !== null && k.position < 6 && k.clicks > 0)
      .slice(0, 20)
      .map((k) => ({ query: k.keyword, impressions: k.impressions, clicks: k.clicks, position: k.position ?? 0 })),
    research: researched.map((k) => ({
      keyword: k.keyword,
      volume: k.volume,
      difficulty: k.difficulty,
      cpc: k.cpc,
      position: k.position,
      intent: k.intent,
      opportunity: k.opportunity,
    })),
    market: provider ? `${provider.locationName} · ${provider.languageName}` : null,
    thinPages: pages
      .filter((p) => p.wordCount > 0 && p.wordCount < 400)
      .slice(0, 20)
      .map((p) => ({ url: p.url, title: p.title, words: p.wordCount })),
    hasGsc: keywords.length > 0,
  };
}

/**
 * The model has no idea what year it is and will happily date a title to its
 * training era, so the current date is stated explicitly.
 */
const SYSTEM = () => `You are an SEO strategist producing a blog plan for one specific website.

Today is ${new Date().toISOString().slice(0, 10)}. Any year you write must be this year or later.

Rules you must follow:
- Every title must be justified by a specific number from the data you are given. Quote it in the rationale.
- Never suggest a topic the site already covers. The existing pages are listed; check before you propose.
- Prefer topics where the site already earns impressions but ranks poorly. Lifting an existing near-miss is far cheaper than ranking something new, and you should say so when that is the reason.
- Titles must read like a person wrote them. No "Ultimate Guide", no "Everything You Need to Know", no year-stuffing unless the topic genuinely changes yearly — and never a past year.
- Be specific to this business. A title that could appear on any site in the industry is a failed suggestion.
- When keyword research is supplied, prefer terms with real monthly volume and a difficulty the site can plausibly beat. Quote both numbers in the rationale.
- A high-volume term with difficulty over 60 is not an opportunity for a small site; say so rather than proposing it.
- score is your honest priority, 0-100. Reserve 80+ for topics with proven demand in the data.

Return JSON only, shaped exactly:
{"ideas":[{"title":"...","angle":"...","targetQuery":"...","rationale":"...","evidenceRef":"...","score":72}]}

- angle: one sentence on what this piece does that the ranking pages do not.
- targetQuery: the single search query this goes after. If one of the researched keywords fits, use it verbatim.
- evidenceRef: the exact data point you used, e.g. "near-miss: crm pricing, 1240 impr, pos 11.4".`;

function renderContext(ctx: SiteContext, count: number, avoid: string[]): string {
  const lines: string[] = [];
  lines.push(`WEBSITE: ${ctx.domain}`);
  lines.push(`WHAT IT IS: ${ctx.summary}`);
  lines.push('');

  lines.push(`EXISTING PAGES (${ctx.pages.length}) — do not duplicate these:`);
  for (const p of ctx.pages) lines.push(`  ${p.url} — "${p.title}" (${p.words} words)`);
  lines.push('');

  if (ctx.nearMiss.length) {
    lines.push('QUERIES RANKING ON PAGE 2-3 (real Search Console data — the cheapest wins):');
    for (const k of ctx.nearMiss) {
      lines.push(`  "${k.query}" — ${k.impressions} impressions, ${k.clicks} clicks, position ${k.position.toFixed(1)}${k.url ? `, currently served by ${k.url}` : ', no page serves this'}`);
    }
    lines.push('');
  }

  if (ctx.noClicks.length) {
    lines.push('QUERIES WITH IMPRESSIONS BUT ZERO CLICKS (the listing is not earning the click):');
    for (const k of ctx.noClicks) lines.push(`  "${k.query}" — ${k.impressions} impressions, position ${k.position.toFixed(1)}`);
    lines.push('');
  }

  if (ctx.winning.length) {
    lines.push('ALREADY WINNING (build adjacent to these, do not repeat them):');
    for (const k of ctx.winning) lines.push(`  "${k.query}" — position ${k.position.toFixed(1)}, ${k.clicks} clicks`);
    lines.push('');
  }

  if (ctx.research.length) {
    const unranked = ctx.research.filter((k) => k.position === null);
    lines.push(`KEYWORD RESEARCH — real monthly search volume and difficulty${ctx.market ? ` for ${ctx.market}` : ''}.`);
    lines.push('difficulty is 0-100: under 30 is winnable for a small site, over 60 usually is not.');
    for (const k of ctx.research) {
      const where = k.position === null ? 'not ranking' : `currently position ${k.position.toFixed(0)}`;
      lines.push(`  "${k.keyword}" — ${k.volume}/mo, difficulty ${k.difficulty}, $${k.cpc.toFixed(2)} cpc, ${k.intent.toLowerCase()}, ${where}`);
    }
    if (unranked.length) {
      lines.push(`${unranked.length} of these have demand and no ranking at all — those are unclaimed.`);
    }
    lines.push('');
  }

  if (ctx.thinPages.length) {
    lines.push('THIN PAGES (too short to compete — a proper article could replace or support them):');
    for (const p of ctx.thinPages) lines.push(`  ${p.url} — "${p.title}" (${p.words} words)`);
    lines.push('');
  }

  if (!ctx.hasGsc) {
    lines.push('NOTE: Search Console is not connected, so there is no performance data.');
    lines.push('Base suggestions on the topics the existing pages reveal, and say plainly in each');
    lines.push('rationale that demand is unverified.');
    lines.push('');
  }

  if (avoid.length) {
    lines.push('ALREADY SUGGESTED — do not repeat or rephrase these:');
    for (const t of avoid) lines.push(`  ${t}`);
    lines.push('');
  }

  lines.push(`Produce ${count} blog titles.`);
  return lines.join('\n');
}

export type GeneratedIdea = z.infer<typeof IdeaSchema>;

export async function generateIdeas(
  siteId: string,
  count = 10,
): Promise<{ ideas: GeneratedIdea[]; usage: LlmUsage; model: string }> {
  const site = await db.site.findUniqueOrThrow({ where: { id: siteId } });
  const ctx = await buildContext(siteId);

  if (ctx.pages.length === 0) {
    throw new Error('Nothing to work from — crawl the website first.');
  }

  const existing = await db.blogIdea.findMany({
    where: { siteId, status: { not: 'DISMISSED' } },
    select: { title: true },
    take: 200,
  });

  const res = await completeJson<unknown>({
    model: site.ideaModel,
    maxTokens: 8000,
    temperature: 0.8,
    messages: [
      { role: 'system', content: SYSTEM() },
      { role: 'user', content: renderContext(ctx, count, existing.map((e) => e.title)) },
    ],
  });

  const parsed = ResponseSchema.safeParse(res.data);
  if (!parsed.success) {
    throw new Error(`The model returned an unexpected shape: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
  }

  return { ideas: parsed.data.ideas, usage: res.usage, model: res.model };
}

/** Work out which signal an idea came from, so the UI can show its provenance. */
export function classifySource(idea: GeneratedIdea, ctx: SiteContext): { source: IdeaSource; impressions?: number; clicks?: number; position?: number } {
  const q = idea.targetQuery.toLowerCase().trim();
  if (q) {
    const near = ctx.nearMiss.find((k) => k.query.toLowerCase() === q);
    if (near) return { source: 'GSC_NEAR_MISS', impressions: near.impressions, clicks: near.clicks, position: near.position };
    const noClick = ctx.noClicks.find((k) => k.query.toLowerCase() === q);
    if (noClick) return { source: 'GSC_NO_CLICKS', impressions: noClick.impressions, clicks: 0, position: noClick.position };
  }
  const ref = idea.evidenceRef.toLowerCase();
  if (ref.includes('thin')) return { source: 'THIN_PAGE' };
  if (ref.includes('near-miss') || ref.includes('impression')) return { source: 'GSC_NEAR_MISS' };
  return { source: 'LLM' };
}

/** Save generated ideas, skipping anything that duplicates an existing title. */
export async function saveIdeas(
  siteId: string,
  ideas: GeneratedIdea[],
  ctx: SiteContext,
): Promise<number> {
  const existing = await db.blogIdea.findMany({ where: { siteId }, select: { title: true } });
  const seen = new Set(existing.map((e) => normalise(e.title)));

  const fresh = ideas.filter((i) => {
    const key = normalise(i.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!fresh.length) return 0;

  await db.blogIdea.createMany({
    data: fresh.map((i) => {
      const cls = classifySource(i, ctx);
      return {
        siteId,
        title: i.title,
        angle: i.angle || null,
        targetQuery: i.targetQuery || null,
        rationale: i.rationale,
        evidence: i.evidenceRef ? [{ source: 'data', finding: i.evidenceRef }] : [],
        source: cls.source,
        score: i.score,
        impressions: cls.impressions ?? null,
        clicks: cls.clicks ?? null,
        position: cls.position ?? null,
        createdBy: 'ai',
      };
    }),
  });

  return fresh.length;
}

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
