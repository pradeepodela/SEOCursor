import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { generateIdeas, saveIdeas, buildContext } from '../../../lib/ideas';
import { llmConfigured, modelBlocker } from '../../../lib/llm';
import { zGenerateIdeas, zAddIdea, parseBody, ok, fail } from '../../../lib/schemas';

export const prerender = false;

/** Generate a fresh batch of blog titles from the site's own data. */
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zGenerateIdeas);
  if (parsed.res) return parsed.res;
  const { siteId, count } = parsed.data;

  if (!llmConfigured()) return fail('No model key set — add GROQ_API_KEY or OPENROUTER_API_KEY to .env to generate titles', 503);

  const site = await db.site.findUnique({ where: { id: siteId } });
  if (!site) return fail('Unknown website', 404);
  if (!site.lastCrawlAt) return fail('Crawl the website first — there is nothing to analyse yet', 409);

  const blocked = modelBlocker(site.ideaModel, 'title model');
  if (blocked) return fail(blocked, 503);

  const job = await db.generationJob.create({ data: { siteId, kind: 'ideas', status: 'RUNNING', phase: 'Reading site data' } });

  try {
    const ctx = await buildContext(siteId);
    const { ideas, usage, model } = await generateIdeas(siteId, count);
    const saved = await saveIdeas(siteId, ideas, ctx);

    await db.generationJob.update({
      where: { id: job.id },
      data: {
        status: 'DONE', phase: 'Complete', model,
        promptTokens: usage.promptTokens, outputTokens: usage.outputTokens, costUsd: usage.costUsd,
        result: { proposed: ideas.length, saved },
        finishedAt: new Date(),
      },
    });

    return ok({
      proposed: ideas.length,
      saved,
      duplicatesSkipped: ideas.length - saved,
      model,
      costUsd: usage.costUsd,
      groundedIn: {
        pages: ctx.pages.length,
        nearMissQueries: ctx.nearMiss.length,
        noClickQueries: ctx.noClicks.length,
        hasSearchConsole: ctx.hasGsc,
      },
    });
  } catch (e) {
    const error = (e as Error).message;
    await db.generationJob.update({ where: { id: job.id }, data: { status: 'FAILED', phase: 'Failed', error, finishedAt: new Date() } }).catch(() => {});
    return fail(error, 502);
  }
};

/** Add a title by hand. */
export const PUT: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zAddIdea);
  if (parsed.res) return parsed.res;
  const { siteId, title, targetQuery, angle, rationale } = parsed.data;

  const site = await db.site.findUnique({ where: { id: siteId } });
  if (!site) return fail('Unknown website', 404);

  const clash = await db.blogIdea.findFirst({
    where: { siteId, title: { equals: title, mode: 'insensitive' } },
  });
  if (clash) return fail('That title is already on the list', 409);

  const idea = await db.blogIdea.create({
    data: {
      siteId, title,
      targetQuery: targetQuery || null,
      angle: angle || null,
      rationale: rationale || 'Added manually.',
      source: 'MANUAL',
      createdBy: 'user',
      score: 50,
    },
  });
  return ok(idea, 201);
};
