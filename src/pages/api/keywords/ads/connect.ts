import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../../../lib/db';
import { ADS_COUNTRIES, ADS_LANGUAGES } from '../../../../lib/googleAdsGeo';
import { parseBody, ok, fail } from '../../../../lib/schemas';

export const prerender = false;

const zAdsMarket = z.object({
  siteId: z.string().min(1),
  geoTarget: z.coerce.number().int().positive(),
  languageId: z.coerce.number().int().positive(),
});

/** Store the Keyword Planner market (geo + language) for this site. */
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zAdsMarket);
  if (parsed.res) return parsed.res;
  const { siteId, geoTarget, languageId } = parsed.data;

  const site = await db.site.findUnique({ where: { id: siteId } });
  if (!site) return fail('Unknown website', 404);

  // Names come from the trusted server-side lists, never the client payload.
  const country = ADS_COUNTRIES.find((c) => c.geoTarget === geoTarget);
  const language = ADS_LANGUAGES.find((l) => l.id === languageId);
  if (!country) return fail('Unknown country', 422);
  if (!language) return fail('Unknown language', 422);

  const conn = await db.googleAdsConnection.upsert({
    where: { siteId },
    update: { geoTarget, geoName: country.name, languageId, languageName: language.name, lastError: null },
    create: { siteId, geoTarget, geoName: country.name, languageId, languageName: language.name },
  });

  return ok({ geoName: conn.geoName, languageName: conn.languageName });
};

/** Disconnect the market. */
export const DELETE: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const siteId = typeof body?.siteId === 'string' ? body.siteId : '';
  if (!siteId) return fail('Missing siteId', 400);
  await db.googleAdsConnection.deleteMany({ where: { siteId } });
  return ok({ disconnected: true });
};
