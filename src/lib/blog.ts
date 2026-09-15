import { z } from 'zod';
import { db } from './db';
import { completeJson, complete, type LlmUsage } from './llm';
import { buildContext } from './ideas';
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

const OutlineSchema = z.object({
  title: clipped(180).pipe(z.string().min(5)),
  slug: clipped(90).pipe(z.string().min(2)),
  metaDescription: clipped(200).pipe(z.string().min(40)),
  targetQuery: clipped(160).optional().default(''),
  intent: z.enum(['INFORMATIONAL', 'COMMERCIAL', 'TRANSACTIONAL', 'NAVIGATIONAL']).catch('INFORMATIONAL').default('INFORMATIONAL'),
  targetWords: z.coerce.number().int().catch(1500).default(1500).transform((n) => Math.min(5000, Math.max(400, n))),
  sections: z.array(z.object({
    heading: clipped(160).pipe(z.string().min(2)),
    covers: clipped(500).optional().default(''),
  })).min(3).transform((v) => v.slice(0, 14)),
  internalLinks: z.array(z.object({
    url: clipped(300),
    anchor: clipped(120),
  })).default([]).transform((v) => v.slice(0, 10)),
  questions: z.array(clipped(200)).default([]).transform((v) => v.slice(0, 10)),
});

export type Outline = z.infer<typeof OutlineSchema>;

/** Models date content to their training era unless told otherwise. */
const today = () => new Date().toISOString().slice(0, 10);

const OUTLINE_SYSTEM = () => `You are planning one blog post for a specific website.

Today is ${today()}. Any year you write must be this year or later.

Rules:
- Only propose internal links to URLs that appear in the page list you are given. Never invent a URL.
- The first section must answer the target query directly — it is the featured-snippet target.
- Include one section that is genuinely useful but commercially inconvenient (a limitation, a case where the reader should not buy). It earns trust and links.
- Headings must be specific. "Benefits" and "Conclusion" are failures; say what the section actually covers.
- targetWords should reflect what the topic needs, not a house minimum.

Return JSON only:
{"title":"...","slug":"...","metaDescription":"...","targetQuery":"...","intent":"INFORMATIONAL","targetWords":1500,
 "sections":[{"heading":"...","covers":"..."}],
 "internalLinks":[{"url":"/pricing","anchor":"..."}],
 "questions":["..."]}`;

const DRAFT_SYSTEM = () => `You are writing a blog post to a supplied outline.

Today is ${today()}. Any year, date or "recent" claim must be consistent with that.

Rules:
- Write in Markdown. Start at the first H2 — do not repeat the title as a heading.
- Follow the outline's sections in order, using its headings verbatim as H2s.
- Be concrete. Use specific numbers, named trade-offs and real scenarios rather than adjectives.
- Where the outline lists internal links, place them naturally as [anchor](url). Never link to a URL not in the outline.
- Do not pad. If a section needs three sentences, write three.
- No "In conclusion", no "In today's fast-paced world", no restating the intro at the end.
- Write like a knowledgeable person explaining something to a colleague, not like marketing copy.

Output the article body only. No preamble, no code fences.`;

export async function buildOutline(
  siteId: string,
  idea: BlogIdea,
): Promise<{ outline: Outline; usage: LlmUsage; model: string }> {
  const site = await db.site.findUniqueOrThrow({ where: { id: siteId } });
  const ctx = await buildContext(siteId);

  const pageList = ctx.pages.slice(0, 50).map((p) => `  ${p.url} — "${p.title}"`).join('\n');

  const user = [
    `WEBSITE: ${ctx.domain}`,
    `WHAT IT IS: ${ctx.summary}`,
    '',
    `POST TO PLAN: ${idea.title}`,
    idea.angle ? `ANGLE: ${idea.angle}` : '',
    idea.targetQuery ? `TARGET QUERY: ${idea.targetQuery}` : '',
    `WHY IT IS WORTH WRITING: ${idea.rationale}`,
    idea.impressions ? `MEASURED DEMAND: ${idea.impressions} impressions, position ${idea.position?.toFixed(1) ?? '—'}` : '',
    '',
    'PAGES ON THIS SITE (the only URLs you may link to):',
    pageList,
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

  return { outline: parsed.data, usage: res.usage, model: res.model };
}

export async function writeDraft(
  siteId: string,
  outline: Outline,
): Promise<{ body: string; usage: LlmUsage; model: string }> {
  const site = await db.site.findUniqueOrThrow({ where: { id: siteId } });

  const user = [
    `TITLE: ${outline.title}`,
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
    onPhase?.('Planning the outline');
    const { outline, usage: u1, model } = await buildOutline(siteId, idea);

    onPhase?.(`Writing ${outline.sections.length} sections`);
    const { body, usage: u2 } = await writeDraft(siteId, outline);

    const wordCount = body.split(/\s+/).filter(Boolean).length;
    const usage = {
      promptTokens: u1.promptTokens + u2.promptTokens,
      outputTokens: u1.outputTokens + u2.outputTokens,
      costUsd: (u1.costUsd ?? 0) + (u2.costUsd ?? 0) || null,
    };

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
        seoScore: scoreDraft(outline, body, wordCount),
        model, promptTokens: usage.promptTokens, outputTokens: usage.outputTokens, costUsd: usage.costUsd,
        status: 'DRAFT',
      },
      create: {
        siteId, blogIdeaId: ideaId,
        title: outline.title, slug, body, wordCount,
        excerpt: outline.metaDescription,
        targetKeyword: outline.targetQuery || idea.targetQuery,
        status: 'DRAFT',
        seoScore: scoreDraft(outline, body, wordCount),
        model, promptTokens: usage.promptTokens, outputTokens: usage.outputTokens, costUsd: usage.costUsd,
      },
    });

    await db.blogIdea.update({ where: { id: ideaId }, data: { status: 'DRAFTED' } });
    return { piece, outline, usage, model };
  } catch (err) {
    await db.blogIdea.update({ where: { id: ideaId }, data: { status: 'SUGGESTED' } }).catch(() => {});
    throw err;
  }
}

/** A blunt readiness score — what is checkable without guessing. */
function scoreDraft(outline: Outline, body: string, words: number): number {
  let score = 50;
  if (words >= outline.targetWords * 0.85) score += 15;
  else if (words >= outline.targetWords * 0.6) score += 8;

  const headings = (body.match(/^##\s/gm) ?? []).length;
  if (headings >= outline.sections.length - 1) score += 10;

  if (outline.internalLinks.length && outline.internalLinks.every((l) => body.includes(l.url))) score += 10;
  if (outline.metaDescription.length >= 120 && outline.metaDescription.length <= 160) score += 5;

  const q = (outline.targetQuery || '').toLowerCase();
  if (q && body.toLowerCase().includes(q)) score += 8;

  return Math.min(98, score);
}

function cleanBody(s: string): string {
  return s
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```$/, '')
    .replace(/^#\s+.*\n+/, '')   // strip a repeated H1 if the model added one
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
