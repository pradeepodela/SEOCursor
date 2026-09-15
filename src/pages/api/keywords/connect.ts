import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { verifyAccount, configured } from '../../../lib/dataforseo';
import { zKeywordMarket, zKeywordDisconnect, parseBody, ok, fail } from '../../../lib/schemas';

export const prerender = false;

/** Store the market for this site, once the credentials are proven to work. */
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zKeywordMarket);
  if (parsed.res) return parsed.res;
  const { siteId, locationCode, locationName, languageCode, languageName } = parsed.data;

  const site = await db.site.findUnique({ where: { id: siteId } });
  if (!site) return fail('Unknown website', 404);

  if (!configured()) {
    return fail('Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to .env, then save the file and try again', 503);
  }

  // Free call, so verifying before storing costs nothing and stops a broken
  // connection from being discovered on the first billed request.
  const account = await verifyAccount();
  if (!account.ok) return fail(account.error ?? 'DataForSEO rejected the credentials', 422);

  const conn = await db.dataForSeoConnection.upsert({
    where: { siteId },
    update: { locationCode, locationName, languageCode, languageName, verifiedAt: new Date(), balanceUsd: account.balanceUsd ?? null, lastError: null },
    create: { siteId, locationCode, locationName, languageCode, languageName, verifiedAt: new Date(), balanceUsd: account.balanceUsd ?? null },
  });

  return ok({
    locationName: conn.locationName,
    languageName: conn.languageName,
    balanceUsd: conn.balanceUsd,
    login: account.login ?? null,
  });
};

export const DELETE: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zKeywordDisconnect);
  if (parsed.res) return parsed.res;

  await db.dataForSeoConnection.deleteMany({ where: { siteId: parsed.data.siteId } });
  return ok({ disconnected: true });
};
