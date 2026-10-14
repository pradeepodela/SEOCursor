import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../../lib/db';
import { parseBody, ok, fail } from '../../../lib/schemas';

export const prerender = false;

const zAddKeywords = z.object({
  siteId: z.string().min(1),
  keywords: z.array(z.string()).min(1).max(200),
});

/** Light-touch intent guess so a hand-added keyword still sorts sensibly. */
function guessIntent(k: string): 'INFORMATIONAL' | 'COMMERCIAL' | 'TRANSACTIONAL' | 'NAVIGATIONAL' {
  const s = ` ${k.toLowerCase()} `;
  if (/\b(buy|price|pricing|cost|cheap|deal|discount|order|subscription|plan)\b/.test(s)) return 'TRANSACTIONAL';
  if (/\b(best|top|vs|versus|review|compare|alternative|software|tool)\b/.test(s)) return 'COMMERCIAL';
  if (/\b(login|log in|sign in|download|app|dashboard|portal)\b/.test(s)) return 'NAVIGATIONAL';
  return 'INFORMATIONAL';
}

/**
 * Add keywords by hand. They are stored as the user's own (MANUAL), so a
 * Search Console re-sync never clears them, and a volume provider fills in their
 * numbers on the next refresh. Duplicates — of each other or of what already
 * exists — are skipped, not errored.
 */
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zAddKeywords);
  if (parsed.res) return parsed.res;
  const { siteId, keywords } = parsed.data;

  const site = await db.site.findUnique({ where: { id: siteId } });
  if (!site) return fail('Unknown website', 404);

  // Normalise: trim, lowercase, drop blanks, de-dupe within the request.
  const cleaned = [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter((k) => k.length >= 2 && k.length <= 120))];
  if (!cleaned.length) return fail('No usable keywords — enter at least one', 422);

  const existing = new Set(
    (await db.keyword.findMany({ where: { siteId, keyword: { in: cleaned } }, select: { keyword: true } }))
      .map((k) => k.keyword),
  );

  const toCreate = cleaned.filter((k) => !existing.has(k));
  if (toCreate.length) {
    await db.keyword.createMany({
      data: toCreate.map((keyword) => ({
        siteId,
        keyword,
        source: 'MANUAL' as const,
        intent: guessIntent(keyword),
        opportunity: 'MEDIUM' as const,
      })),
      skipDuplicates: true,
    });
  }

  return ok({ added: toCreate.length, skipped: cleaned.length - toCreate.length });
};
