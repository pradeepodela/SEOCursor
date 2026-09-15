import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { generateBlog } from '../../../lib/blog';
import { llmConfigured, modelBlocker } from '../../../lib/llm';
import { mdToHtml } from '../../../lib/generate';
import { zGenerateBlog, parseBody, ok, fail } from '../../../lib/schemas';

export const prerender = false;

/** Write the post for one idea, now. */
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zGenerateBlog);
  if (parsed.res) return parsed.res;
  const { siteId, ideaId } = parsed.data;

  if (!llmConfigured()) return fail('No model key set — add GROQ_API_KEY or OPENROUTER_API_KEY to .env to write content', 503);

  const idea = await db.blogIdea.findFirst({ where: { id: ideaId, siteId } });
  if (!idea) return fail('Idea not found', 404);

  const site = await db.site.findUnique({ where: { id: siteId }, select: { draftModel: true } });
  const blocked = site && modelBlocker(site.draftModel, 'writing model');
  if (blocked) return fail(blocked, 503);

  const job = await db.generationJob.create({
    data: { siteId, kind: 'draft', status: 'RUNNING', phase: 'Planning the outline', ideaId },
  });

  try {
    const { piece, outline, usage, model } = await generateBlog(siteId, ideaId, (phase) => {
      void db.generationJob.update({ where: { id: job.id }, data: { phase } }).catch(() => {});
    });

    await db.generationJob.update({
      where: { id: job.id },
      data: {
        status: 'DONE', phase: 'Complete', contentId: piece.id, model,
        promptTokens: usage.promptTokens, outputTokens: usage.outputTokens, costUsd: usage.costUsd,
        finishedAt: new Date(),
      },
    });

    return ok({
      id: piece.id,
      title: piece.title,
      slug: piece.slug,
      wordCount: piece.wordCount,
      seoScore: piece.seoScore,
      excerpt: piece.excerpt,
      status: piece.status,
      model,
      costUsd: usage.costUsd,
      sections: outline.sections.length,
      internalLinks: outline.internalLinks.length,
      html: mdToHtml(piece.body),
    }, 201);
  } catch (e) {
    const error = (e as Error).message;
    await db.generationJob.update({ where: { id: job.id }, data: { status: 'FAILED', phase: 'Failed', error, finishedAt: new Date() } }).catch(() => {});
    return fail(error, 502);
  }
};
