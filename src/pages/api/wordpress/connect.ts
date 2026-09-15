import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { verifyConnection, normalizeBaseUrl } from '../../../lib/wordpress';
import { zWpConnect, zWpDisconnect, parseBody, ok, fail } from '../../../lib/schemas';

export const prerender = false;

/** Verify the credentials before storing them — a connection that fails silently is worse than none. */
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zWpConnect);
  if (parsed.res) return parsed.res;
  const { siteId, baseUrl: rawBaseUrl, username, appPassword, defaultStatus, defaultCategory } = parsed.data;

  // Store the normalised form so what we verified is what we later publish to.
  const baseUrl = normalizeBaseUrl(rawBaseUrl);

  const site = await db.site.findUnique({ where: { id: siteId } });
  if (!site) return fail('Unknown website', 404);

  const check = await verifyConnection(baseUrl, username, appPassword);
  if (!check.ok) return fail(check.error ?? 'Could not reach WordPress', 422);
  if (check.canPublish === false) {
    return fail(`${check.user ?? username} can sign in but cannot publish posts on that site`, 403);
  }

  const conn = await db.wordPressConnection.upsert({
    where: { siteId },
    update: { baseUrl, username, appPassword, defaultStatus, defaultCategory: defaultCategory ?? null, verifiedAt: new Date(), lastError: null },
    create: { siteId, baseUrl, username, appPassword, defaultStatus, defaultCategory: defaultCategory ?? null, verifiedAt: new Date() },
  });

  return ok({
    connected: true,
    siteName: check.siteName,
    user: check.user,
    categories: check.categories ?? [],
    defaultStatus: conn.defaultStatus,
  });
};

export const DELETE: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zWpDisconnect);
  if (parsed.res) return parsed.res;

  const conn = await db.wordPressConnection.findUnique({ where: { siteId: parsed.data.siteId } });
  if (!conn) return fail('Nothing connected', 404);

  await db.wordPressConnection.delete({ where: { siteId: parsed.data.siteId } });
  // Turn off any auto-publish that would now fail.
  await db.calendarItem.updateMany({ where: { siteId: parsed.data.siteId, autoPublish: true }, data: { autoPublish: false } });
  return ok({ disconnected: true });
};
