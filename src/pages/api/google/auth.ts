import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { authUrl, isConfigured } from '../../../lib/google';
import { fail } from '../../../lib/schemas';

export const prerender = false;

/** Kick off the consent flow for one website. */
export const GET: APIRoute = async ({ url, redirect }) => {
  if (!isConfigured()) {
    return fail('Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env', 503);
  }
  const siteId = url.searchParams.get('site');
  if (!siteId) return fail('Missing site', 400);

  const site = await db.site.findUnique({ where: { id: siteId } });
  if (!site) return fail('Unknown website', 404);

  return redirect(authUrl(site.id), 302);
};
