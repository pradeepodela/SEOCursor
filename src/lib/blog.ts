import { z } from 'zod';
import { db } from './db';
import { listTerms, type WpTerm } from './wordpress';
import { completeJson, complete, type LlmUsage } from './llm';
import { buildContext } from './ideas';
import { gatherFacts, renderFacts, findFabrication, type SiteFacts } from './facts';
import type { BlogIdea } from '@prisma/client';

/**
 * Turning one idea into a finished post.
 *
 * Two passes: an outline grounded in the site's own pages (so internal links
 * point at URLs that exist), then the draft. Splitting them keeps the article
 * on-brief and makes the intermediate step reviewable.
 */

/**
 * Length limits here are storage and sanity bounds, not correctness ones — a
 * model that writes a 600-character section brief has still produced a usable
 * outline, and throwing the whole two-pass generation away over it wastes a
 * paid call. Clip instead of reject; only genuinely unusable shapes fail.
 */
const clipped = (max: number) => z.string().trim().transform((v) => v.slice(0, max));

/** Trim to a length without leaving a severed word. */
const clipWords = (max: number) =>
  z.string().trim().transform((v) => {
    if (v.length <= max) return v;
    const cut = v.slice(0, max);
    return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:\s]+$/, '');
  });

const OutlineSchema = z.object({
  title: clipped(180).pipe(z.string().min(5)),
  slug: clipped(90).pipe(z.string().min(2)),
  metaDescription: clipWords(158).pipe(z.string().min(40)),
  targetQuery: clipped(160).optional().default(''),
  intent: z.enum(['INFORMATIONAL', 'COMMERCIAL', 'TRANSACTIONAL', 'NAVIGATIONAL']).catch('INFORMATIONAL').default('INFORMATIONAL'),
  targetWords: z.coerce.number().int().catch(1500).default(1500).transform((n) => Math.min(5000, Math.max(400, n))),
  audience: clipped(200).optional().default(''),
  // Models sometimes return a section as a bare heading string. That is a
  // usable outline written in a slightly different shape, and throwing away a
  // paid two-pass generation over it helps nobody.
  sections: z.array(
    z.preprocess(
      (v) => (typeof v === 'string' ? { heading: v, covers: '' } : v),
      z.object({
        heading: clipped(160).pipe(z.string().min(2)),
        covers: clipped(500).optional().default(''),
      }),
    ),
  ).min(3).transform((v) => v.slice(0, 14)),
  internalLinks: z.array(
    z.preprocess(
      (v) => (typeof v === 'string' ? { url: v, anchor: v } : v),
      z.object({ url: clipped(300), anchor: clipped(120) }),
    ),
  ).default([]).transform((v) => v.slice(0, 10)),
  questions: z.array(clipped(200)).default([]).transform((v) => v.slice(0, 10)),

  // WordPress taxonomy, proposed alongside the outline rather than in a third
  // call. The outline pass already knows the topic, the target query and the
  // audience, so asking it here costs nothing extra and keeps the suggestion
  // grounded in the same reasoning that shaped the post.
  category: clipped(80).optional().default(''),
  tags: z.array(clipped(50)).default([]).transform((v) =>
    // Deduplicate case-insensitively: "Astro" and "astro" are one tag to
    // WordPress, and sending both just creates noise on the post.
    [...new Map(v.map((t) => [t.trim().toLowerCase(), t.trim()])).values()]
      .filter(Boolean)
      .slice(0, 8),
  ),
});

export type Outline = z.infer<typeof OutlineSchema>;

/** Models date content to their training era unless told otherwise. */
const today = () => new Date().toISOString().slice(0, 10);

const OUTLINE_SYSTEM = () => `You are planning one blog post for a specific website.

Today is ${today()}. Any year you write must be this year or later.

WHO IT IS FOR
The reader is the person who buys or uses this product — an operator, not an
engineer, unless the site itself is for engineers. Judge this from the site's
own pages. A gym owner does not want to train a model in Python; they want to
know which members are about to quit and what to do on Monday morning. Planning
a post the audience cannot act on is the most expensive mistake available here,
because it ranks for nothing and converts nobody.

GROUNDING — the hard rule
You are given what the site actually says about itself. Every product
capability you reference must come from that. If the outline needs a feature
the site does not mention, drop the section rather than assume the feature
exists. Never invent an API, an endpoint, a field name, an integration, a
customer, a statistic or a study.

STRUCTURE — for search and for AI answers
Search engines and AI assistants reward different things and both matter.
- Section 1 must answer the target query directly and completely, in a way that
  makes sense quoted on its own with no surrounding context. This is what gets
  lifted into an AI Overview or a featured snippet.
- Every later section must answer one specific question a real reader has, and
  must stand alone when quoted. Assume each section may be read in isolation.
- Headings must be the question the reader would actually type or ask. "Benefits"
  and "Conclusion" are failures. "How much does gym management software cost in
  India?" is a heading.
- Include one section that is useful but commercially inconvenient — a limit, a
  case where the reader should not buy. It earns trust and it earns citations.
- Only propose internal links to URLs in the page list you are given.
- targetWords should reflect what the topic needs, not a house minimum.

questions: the specific questions this post must answer outright. These become
an FAQ block, so each must be a real question with a short factual answer.

CATEGORY AND TAGS
category: where this post belongs on the site. If you are given a list of
categories that exist, choose exactly one from it and copy the name verbatim —
a name that is not on the list files the post nowhere, so an empty string is
the better answer when nothing fits. If you are given no list, leave it empty.

tags: three to six specific topics this post is actually about, as a reader
would search for them. Tags are created on the site if they do not exist, so
specific beats broad and restraint beats volume — "core web vitals" and
"server-side rendering" are useful, "marketing", "business" and "tips" are
noise that will accumulate on every post you write.

Return JSON only:
{"title":"...","slug":"...","metaDescription":"...","targetQuery":"...","intent":"INFORMATIONAL","targetWords":1500,
 "audience":"who this is written for, in one line",
 "sections":[{"heading":"...","covers":"..."}],
 "internalLinks":[{"url":"/pricing","anchor":"..."}],
 "questions":["..."],
 "category":"","tags":["..."]}`;

const DRAFT_SYSTEM = () => `You are writing a blog post to a supplied outline.

Today is ${today()}. Any year, date or "recent" claim must be consistent with that.

THE ONE RULE THAT OVERRIDES EVERYTHING
Write only what the supplied facts support. You are given what this site says
about itself; that is the entire universe of product detail available to you.

- Never state a statistic, percentage, benchmark or study result. Not one. If
  you have not been handed the number, the number does not go in the article.
  A sentence like "cutting churn from 4.2% to 2.7%" is a fabrication even when
  it sounds reasonable, and it is the single fastest way to destroy the
  credibility of the site you are writing for.
- Never invent an API endpoint, field name, integration, pricing figure,
  customer, or case study. If you need one and do not have it, write around it.
- Where a real number would help and you do not have one, say what the reader
  should measure instead. "Track the share of members who miss two consecutive
  weeks" is useful. "23% of members who miss two weeks cancel" is invention.

WRITING FOR AI ANSWERS AS WELL AS SEARCH
- Open with a direct answer to the target query in 40-60 words, before any
  preamble. No throat-clearing, no "in this article we will". Someone skimming
  the first paragraph should already have their answer.
- Each section must make sense lifted out on its own. Restate the subject
  rather than leaning on "it" or "this" across a heading boundary — an AI
  quoting one paragraph gets no context from the one above it.
- Define terms plainly the first time they appear.
- Prefer short declarative sentences for anything factual. They get quoted;
  hedged compound sentences do not.
- Use a table when comparing three or more things on the same dimensions.

VOICE
- Write in Markdown. Open with the direct-answer paragraph under no heading at
  all, then go straight into the first H2. Do not repeat the title as a heading
  and do not label the opening paragraph — no "Direct answer", no "Summary",
  no "Introduction". It is simply the first thing on the page.
- Follow the outline's sections in order, using its headings verbatim as H2s.
- Write for the stated audience. If they are an operator, no code, no library
  names, no model architectures.
- Concrete means named trade-offs and real scenarios, not invented figures.
- Depth comes from explaining how something works, walking through what the
  reader does step by step, and naming what goes wrong — not from figures. A
  section is thin because it skipped the mechanism, not because it lacked a
  statistic. Write the full walkthrough: where to click, what to expect, what to
  do when it does not work.
- Numbers shown in screenshots or product demos on the site are sample data.
  Describe what the screen shows ("the dashboard lists memberships expiring in
  the next 14 days"), never the sample figures themselves.
- Every H2 section needs at least 120 words of real explanation. A four-line
  section has not answered its own heading, and a heading that goes unanswered
  is worse than no heading. If you cannot reach 120 words honestly, the section
  does not belong in the article.
- Do not pad to reach that. Reach it by explaining the mechanism, walking
  through the steps, and naming what goes wrong.
- No "In conclusion", no "In today's fast-paced world", no restating the intro.
- No em-dash-heavy AI cadence, no "delve", no "landscape", no "game-changer",
  no "it's not just X, it's Y".
- Every internal link listed below must appear in the finished article, placed
  where it genuinely helps. They are not optional. Never link to a URL not in
  the list.

End with an H2 "Frequently asked questions" containing each supplied question as
an H3 with a two to four sentence answer directly beneath it.

Output the article body only. No preamble, no code fences.`;

export async function buildOutline(
  siteId: string,
  idea: BlogIdea,
): Promise<{ outline: Outline; usage: LlmUsage; model: string }> {
  const site = await db.site.findUniqueOrThrow({ where: { id: siteId } });
  const ctx = await buildContext(siteId);

  const facts = await gatherFacts(siteId);
  const pageList = ctx.pages.slice(0, 50).map((p) => `  ${p.url} — "${p.title}"`).join('\n');

  // The real category list, when there is a site to read it from. Asking a
  // model to pick from an actual list is the difference between a category
  // that files the post correctly and an invented one that quietly does
  // nothing at publish time.
  const wpCategories = await listTerms(siteId, 'categories').catch(() => [] as WpTerm[]);

  const user = [
    renderFacts(facts),
    '',
    `POST TO PLAN: ${idea.title}`,
    idea.angle ? `ANGLE: ${idea.angle}` : '',
    idea.targetQuery ? `TARGET QUERY: ${idea.targetQuery}` : '',
    `WHY IT IS WORTH WRITING: ${idea.rationale}`,
    idea.impressions ? `MEASURED DEMAND: ${idea.impressions} impressions, position ${idea.position?.toFixed(1) ?? '—'}` : '',
    '',
    'PAGES ON THIS SITE (the only URLs you may link to):',
    pageList,
    wpCategories.length
      ? '\nCATEGORIES THAT EXIST ON THIS SITE (pick exactly one, copied verbatim, or leave `category` empty if none fit):\n' +
        wpCategories.slice(0, 40).map((c) => `  ${c.name}${c.count ? ` (${c.count} posts)` : ''}`).join('\n')
      : '',
  ].filter(Boolean).join('\n');

  const res = await completeJson<unknown>({
    model: site.draftModel,
    maxTokens: 4000,
    temperature: 0.6,
    messages: [{ role: 'system', content: OUTLINE_SYSTEM() }, { role: 'user', content: user }],
  });

  const parsed = OutlineSchema.safeParse(res.data);
  if (!parsed.success) {
    throw new Error(`Outline came back malformed: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`);
  }

  // Drop any link the model invented despite being told not to.
  const real = new Set(ctx.pages.map((p) => p.url));
  parsed.data.internalLinks = parsed.data.internalLinks.filter((l) => real.has(l.url));
  parsed.data.slug = slugify(parsed.data.slug || parsed.data.title);

  // Same rule for the category. A name that is not on the site would be
  // silently ignored at publish time, so resolve it to the real spelling or
  // drop it — an empty category is honest, a fictional one is not.
  if (parsed.data.category && wpCategories.length) {
    const hit = wpCategories.find(
      (c) => c.name.trim().toLowerCase() === parsed.data.category.trim().toLowerCase(),
    );
    parsed.data.category = hit?.name ?? '';
  }

  return { outline: parsed.data, usage: res.usage, model: res.model };
}

export async function writeDraft(
  siteId: string,
  outline: Outline,
  facts?: SiteFacts,
): Promise<{ body: string; usage: LlmUsage; model: string }> {
  const site = await db.site.findUniqueOrThrow({ where: { id: siteId } });
  const sheet = facts ?? await gatherFacts(siteId);

  const user = [
    // The facts come first so the constraint is read before the assignment.
    renderFacts(sheet),
    '',
    `TITLE: ${outline.title}`,
    outline.audience ? `WRITING FOR: ${outline.audience}` : '',
    `TARGET QUERY: ${outline.targetQuery || '(none)'}`,
    `INTENT: ${outline.intent}`,
    `TARGET LENGTH: about ${outline.targetWords} words`,
    '',
    'SECTIONS:',
    ...outline.sections.map((s, i) => `${i + 1}. ${s.heading}${s.covers ? ` — ${s.covers}` : ''}`),
    '',
    outline.internalLinks.length
      ? `INTERNAL LINKS TO PLACE:\n${outline.internalLinks.map((l) => `  [${l.anchor}](${l.url})`).join('\n')}`
      : '',
    outline.questions.length
      ? `QUESTIONS TO ANSWER SOMEWHERE:\n${outline.questions.map((q) => `  ${q}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n');

  const res = await complete({
    model: site.draftModel,
    maxTokens: Math.min(16000, Math.round(outline.targetWords * 3)),
    temperature: 0.7,
    messages: [{ role: 'system', content: DRAFT_SYSTEM() }, { role: 'user', content: user }],
  });

  return { body: cleanBody(res.data), usage: res.usage, model: res.model };
}

/** Full pipeline: idea → outline → draft → stored ContentPiece. */
export async function generateBlog(siteId: string, ideaId: string, onPhase?: (p: string) => void) {
  const idea = await db.blogIdea.findFirstOrThrow({ where: { id: ideaId, siteId } });

  // Regenerating replaces the stored piece, which would quietly revert a live
  // post to a draft. Refuse before spending any tokens.
  const prior = await db.contentPiece.findUnique({ where: { blogIdeaId: ideaId } });
  if (prior?.status === 'PUBLISHED') {
    throw new Error('This idea is already published. Unpublish it first if you want to rewrite it.');
  }

  await db.blogIdea.update({ where: { id: ideaId }, data: { status: 'GENERATING' } });

  try {
    onPhase?.('Reading what the site says');
    const facts = await gatherFacts(siteId);
    if (!facts.evidence.length) {
      throw new Error('No page content to work from. Re-crawl the site so the writer has real material — an ungrounded draft invents features.');
    }

    onPhase?.('Planning the outline');
    const { outline, usage: u1, model } = await buildOutline(siteId, idea);

    onPhase?.(`Writing ${outline.sections.length} sections`);
    const { body: rawBody, usage: u2 } = await writeDraft(siteId, outline, facts);

    const body = placeLinks(rawBody, outline.internalLinks);

    onPhase?.('Checking claims');
    const suspicions = findFabrication(body, facts);

    const wordCount = body.split(/\s+/).filter(Boolean).length;
    const usage = {
      promptTokens: u1.promptTokens + u2.promptTokens,
      outputTokens: u1.outputTokens + u2.outputTokens,
      costUsd: (u1.costUsd ?? 0) + (u2.costUsd ?? 0) || null,
    };

    const grade = gradeDraft(outline, body, wordCount, suspicions);

    onPhase?.('Saving the draft');

    // One idea owns at most one piece, so the relation is the identity here.
    // Keying the upsert on the slug instead meant a regeneration — whose title
    // and therefore slug drifts slightly — took the create branch and hit the
    // unique constraint on blogIdeaId.
    const existing = await db.contentPiece.findUnique({ where: { blogIdeaId: ideaId } });
    const slug = await uniqueSlug(siteId, outline.slug, existing?.id);

    const piece = await db.contentPiece.upsert({
      where: { blogIdeaId: ideaId },
      update: {
        title: outline.title, slug, body, wordCount, excerpt: outline.metaDescription,
        targetKeyword: outline.targetQuery || idea.targetQuery,
        seoScore: grade.score,
        model, promptTokens: usage.promptTokens, outputTokens: usage.outputTokens, costUsd: usage.costUsd,
        status: 'DRAFT',
        categories: outline.category ? [outline.category] : [],
        tags: outline.tags,
        termsFromModel: true,
      },
      create: {
        siteId, blogIdeaId: ideaId,
        title: outline.title, slug, body, wordCount,
        excerpt: outline.metaDescription,
        targetKeyword: outline.targetQuery || idea.targetQuery,
        status: 'DRAFT',
        seoScore: grade.score,
        model, promptTokens: usage.promptTokens, outputTokens: usage.outputTokens, costUsd: usage.costUsd,
        categories: outline.category ? [outline.category] : [],
        tags: outline.tags,
        termsFromModel: true,
      },
    });

    await db.blogIdea.update({ where: { id: ideaId }, data: { status: 'DRAFTED' } });
    return { piece, outline, usage, model, suspicions, grade, schema: buildSchema(outline, body, facts) };
  } catch (err) {
    await db.blogIdea.update({ where: { id: ideaId }, data: { status: 'SUGGESTED' } }).catch(() => {});
    throw err;
  }
}

/**
 * Structured data.
 *
 * An FAQPage block is the cheapest way to become quotable: it hands search
 * engines and AI assistants question-and-answer pairs already separated from
 * the prose, rather than asking them to infer the boundaries themselves.
 */
export function buildSchema(outline: Outline, body: string, facts: SiteFacts): object[] {
  const out: object[] = [{
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: outline.title.slice(0, 110),
    description: outline.metaDescription,
    about: outline.targetQuery || undefined,
    inLanguage: 'en',
    datePublished: today(),
    dateModified: today(),
    publisher: { '@type': 'Organization', name: facts.domain },
  }];

  // Pull the answers back out of the draft rather than trusting the outline —
  // the article is what ships, so the schema has to describe the article.
  const faq: { q: string; a: string }[] = [];
  const faqStart = body.search(/^##\s+Frequently asked questions\s*$/im);
  if (faqStart >= 0) {
    const block = body.slice(faqStart);
    for (const m of block.matchAll(/^###\s+(.+?)\s*$\n+([\s\S]*?)(?=\n##|\n###|$)/gm)) {
      const q = m[1].trim();
      const a = m[2].replace(/\s+/g, ' ').trim();
      if (q && a.length > 20) faq.push({ q, a: a.slice(0, 1200) });
    }
  }

  if (faq.length) {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
  }

  return out;
}

export type DraftGrade = {
  score: number;
  checks: { label: string; ok: boolean; detail?: string }[];
};

/**
 * What the draft is actually worth.
 *
 * The previous version counted headings and word count, which is why a draft
 * full of invented statistics scored 83. Formatting is the easy half and it is
 * not the half that fails. This grades the things that decide whether a page
 * ranks, gets cited, or gets a reader to trust it — and subtracts hard for
 * fabrication, because one invented number costs more than good structure
 * earns.
 */
export function gradeDraft(
  outline: Outline,
  body: string,
  words: number,
  suspicions: { kind: string; quote: string }[],
): DraftGrade {
  const checks: DraftGrade['checks'] = [];
  const lower = body.toLowerCase();
  const add = (label: string, ok: boolean, detail?: string) => { checks.push({ label, ok, detail }); return ok; };

  let score = 0;

  // --- trust
  const clean = suspicions.length === 0;
  add('No unsourced statistics or invented detail', clean,
    clean ? undefined : `${suspicions.length} claim${suspicions.length > 1 ? 's' : ''} need checking`);
  score += clean ? 30 : Math.max(0, 30 - suspicions.length * 10);

  // --- answering the query
  const firstPara = body.split(/\n\s*\n/).find((b) => !b.startsWith('#'))?.trim() ?? '';
  const answerWords = firstPara.split(/\s+/).filter(Boolean).length;
  if (add('Opens with a direct answer (30-90 words)', answerWords >= 30 && answerWords <= 90, `${answerWords} words`)) score += 12;

  // Word-level, not substring: an opening that says "predict gym member churn"
  // has answered "gym churn prediction", and failing it for word order taught
  // nothing useful.
  const stem = (w: string) => w.replace(/(ing|ion|ions|ed|es|s)$/, '');
  const queryWords = (outline.targetQuery || '').toLowerCase().match(/[a-z]{3,}/g)?.map(stem) ?? [];
  const openWords = new Set((firstPara.toLowerCase().match(/[a-z]{3,}/g) ?? []).map(stem));
  const covered = queryWords.filter((w) => openWords.has(w)).length;
  if (add('Opening covers the target query',
    queryWords.length > 0 && covered / queryWords.length >= 0.7,
    outline.targetQuery ? `${covered}/${queryWords.length} terms` : 'no target query')) score += 8;

  // --- citability
  const faqCount = (body.match(/^###\s+.+\?\s*$/gm) ?? []).length;
  if (add('Has an FAQ block for AI answers', faqCount >= 2, `${faqCount} questions`)) score += 12;

  const questionHeadings = (body.match(/^##\s+.*\?\s*$/gm) ?? []).length;
  if (add('Headings are phrased as real questions', questionHeadings >= 1, `${questionHeadings} of ${outline.sections.length}`)) score += 6;

  // --- substance
  if (add('Meets the planned length', words >= outline.targetWords * 0.85, `${words} of ${outline.targetWords}`)) score += 10;
  else if (words >= outline.targetWords * 0.6) score += 5;

  const linksPlaced = outline.internalLinks.length > 0 && outline.internalLinks.every((l) => body.includes(l.url));
  if (add('Internal links all placed', linksPlaced, `${outline.internalLinks.length} planned`)) score += 8;

  if (add('Meta description is 120-160 characters', outline.metaDescription.length >= 120 && outline.metaDescription.length <= 160,
    `${outline.metaDescription.length} chars`)) score += 4;

  // --- voice
  const SLOP = ['in today\'s fast-paced', 'in conclusion', 'delve', 'game-changer', 'it\'s not just', 'landscape of', 'unlock the power', 'navigate the complexities'];
  const found = SLOP.filter((p) => lower.includes(p));
  if (add('No filler phrasing', found.length === 0, found.join(', '))) score += 10;

  return { score: Math.max(0, Math.min(99, score)), checks };
}

/**
 * Place planned internal links the writer left out.
 *
 * Two drafts in a row ignored the instruction, and a link that exists only in
 * the outline is worth nothing. This only links text already present in the
 * prose — it never invents an anchor, never touches a heading, and links each
 * URL once — so the article still reads as written.
 */
export function placeLinks(body: string, links: { url: string; anchor: string }[]): string {
  let out = body;

  for (const { url, anchor } of links) {
    if (out.includes(`](${url})`)) continue;          // already placed
    // Try the whole anchor first, then progressively shorter tails of it: an
    // article that never says "class booking management" may well say "class
    // bookings". Still only ever links words that are already on the page.
    const words = anchor.trim().split(/\s+/).filter(Boolean);
    const candidates = [anchor.trim()];
    for (let take = Math.min(3, words.length); take >= 2; take--) {
      candidates.push(words.slice(-take).join(' '));
    }
    if (words.length === 1) candidates.push(words[0]);

    const phrase = candidates.find((c) => {
      if (c.length < 4) return false;
      const esc = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return out.split('\n').some((l) => !l.startsWith('#') && !l.includes('](') && new RegExp(`\\b${esc}\\b`, 'i').test(l));
    });
    if (!phrase) continue;

    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Skip headings, existing links, and anything inside link syntax already.
    const pattern = new RegExp(`(^(?!#).*?)\\b(${escaped})\\b`, 'im');

    const line = out.split('\n').findIndex((l) => !l.startsWith('#') && !l.includes('](') && new RegExp(`\\b${escaped}\\b`, 'i').test(l));
    if (line < 0) continue;

    const lines = out.split('\n');
    lines[line] = lines[line].replace(new RegExp(`\\b(${escaped})\\b`, 'i'), `[$1](${url})`);
    out = lines.join('\n');
    void pattern;
  }

  return out;
}

function cleanBody(s: string): string {
  return s
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```$/, '')
    .replace(/^#\s+.*\n+/, '')   // strip a repeated H1 if the model added one
    // A label on the opening paragraph is the instruction leaking into the
    // page. The paragraph stays; the heading goes.
    .replace(/^#{2,3}\s*(direct answer|summary|introduction|quick answer|tl;?dr)\s*\n+/i, '')
    .trim();
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 70).replace(/^-|-$/g, '');

/**
 * `ownerId` is the piece being rewritten, if any. Without it a regeneration
 * collides with its own previous draft and walks the slug to "-2", "-3", and so
 * on every time you press the button.
 */
async function uniqueSlug(siteId: string, base: string, ownerId?: string): Promise<string> {
  const slug = slugify(base) || 'post';
  const free = async (candidate: string) => {
    const c = await db.contentPiece.findUnique({ where: { siteId_slug: { siteId, slug: candidate } } });
    return !c || c.id === ownerId;
  };
  if (await free(slug)) return slug;
  for (let i = 2; i < 40; i++) {
    const candidate = `${slug}-${i}`.slice(0, 80);
    if (await free(candidate)) return candidate;
  }
  return `${slug}-${Date.now().toString(36)}`;
}
