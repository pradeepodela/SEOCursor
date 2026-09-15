import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { zGscSelectProperty, parseBody, ok, fail } from '../../../lib/schemas';

export const prerender = false;

/** Choose which Search Console property this website maps to. */
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zGscSelectProperty);
  if (parsed.res) return parsed.res;
  const { siteId, propertyUrl } = parsed.data;

  const conn = await db.gscConnection.findUnique({ where: { siteId } });
  if (!conn) return fail('Search Console is not connected', 409);
  if (!conn.properties.includes(propertyUrl)) {
    return fail('That property is not available on the connected Google account', 422);
  }

  const updated = await db.gscConnection.update({
    where: { siteId },
    data: { propertyUrl, syncError: null },
  });
  return ok({ propertyUrl: updated.propertyUrl });
};
