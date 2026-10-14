import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../../lib/db';
import { generateKeywordIdeas } from '../../../lib/ideas';
import { llmConfigured, modelBlocker } from '../../../lib/llm';
import { parseBody, ok, fail } from '../../../lib/schemas';

export const prerender = false;

const zSuggest = z.object({
  siteId: z.string().min(1),
  count: z.coerce.number().int().min(5).max(40).default(20),
  seed: z.string().trim().max(120).optional().default(''),
});

/**
 * AI keyword suggestions, grounded in the site. Discovery only — the model
 * proposes terms, never numbers. The caller reviews them before adding.
 */
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zSuggest);
  if (parsed.res) return parsed.res;
  const { siteId, count, seed } = parsed.data;

  if (!llmConfigured()) {
    return fail('No model key set — add GROQ_API_KEY or OPENROUTER_API_KEY to .env to suggest keywords', 503);
  }

  const site = await db.site.findUnique({ where: { id: siteId } });
  if (!site) return fail('Unknown website', 404);

  const blocked = modelBlocker(site.ideaModel, 'keyword model');
  if (blocked) return fail(blocked, 503);

  try {
    const { keywords, model } = await generateKeywordIdeas(siteId, count, seed);
    return ok({ keywords: keywords.map((k) => k.keyword), model });
  } catch (e) {
    return fail((e as Error).message, 502);
  }
};
