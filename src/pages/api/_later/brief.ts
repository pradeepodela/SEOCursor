import type { APIRoute } from 'astro';
import { db } from '../../lib/db';
import { buildBrief } from '../../lib/generate';
import { zCreateBrief, parseBody, ok, fail } from '../../lib/schemas';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zCreateBrief);
  if (parsed.res) return parsed.res;
  const { siteId, opportunityId, targetKeyword } = parsed.data;

  let opportunity = opportunityId
    ? await db.opportunity.findFirst({ where: { id: opportunityId, siteId } })
    : targetKeyword
      ? await db.opportunity.findFirst({ where: { siteId, subject: { contains: targetKeyword, mode: 'insensitive' } } })
      : null;

  if (!opportunity && targetKeyword) {
    // No matching backlog item — mint one so the brief still has provenance.
    const kw = await db.keyword.findFirst({ where: { siteId, keyword: { contains: targetKeyword, mode: 'insensitive' } } });
    opportunity = await db.opportunity.create({
      data: {
        siteId,
        rank: 99,
        title: `Create content for "${targetKeyword}"`,
        subject: kw?.keyword ?? targetKeyword,
        type: 'NEW_CONTENT',
        impact: 'MEDIUM',
        effort: 'MEDIUM',
        searchVolume: kw?.volume ?? null,
        difficulty: kw?.difficulty ?? null,
        recommendedAction: `Create a dedicated page targeting "${targetKeyword}".`,
        reasoning: kw
          ? [{ source: 'Keyword data', finding: `${kw.volume.toLocaleString()} searches/month, difficulty ${kw.difficulty}.` }]
          : [{ source: 'Request', finding: 'Created on request from the assistant.' }],
        conclusion: 'CREATE CONTENT — requested directly.',
      },
    });
  }

  if (!opportunity) return fail('Provide an opportunityId or a targetKeyword', 422);

  const brief = await buildBrief(siteId, opportunity);
  return ok(brief);
};
