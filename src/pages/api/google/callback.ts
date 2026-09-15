import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { exchangeCode, verifyState, listProperties, matchProperty, fetchGoogleEmail, GSC_SCOPE } from '../../../lib/google';

export const prerender = false;

/** Google sends the user back here. Exchange the code and store the connection. */
export const GET: APIRoute = async ({ url, redirect }) => {
  const err = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const back = (siteId: string | null, params: Record<string, string>) =>
    redirect(`/settings?${new URLSearchParams({ ...(siteId ? { site: siteId } : {}), ...params })}`, 302);

  if (err) return back(null, { gsc: 'error', reason: err });
  if (!code || !state) return back(null, { gsc: 'error', reason: 'missing_code' });

  const siteId = verifyState(state);
  if (!siteId) return back(null, { gsc: 'error', reason: 'bad_state' });

  const site = await db.site.findUnique({ where: { id: siteId } });
  if (!site) return back(null, { gsc: 'error', reason: 'unknown_site' });

  try {
    const token = await exchangeCode(code);
    if (!token.refresh_token) {
      // Without a refresh token the connection dies in an hour.
      return back(siteId, { gsc: 'error', reason: 'no_refresh_token' });
    }

    const [properties, email] = await Promise.all([
      listProperties(token.access_token),
      fetchGoogleEmail(token.access_token),
    ]);
    const matched = matchProperty(properties, site.domain);

    await db.gscConnection.upsert({
      where: { siteId },
      update: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: new Date(Date.now() + token.expires_in * 1000),
        scope: token.scope ?? GSC_SCOPE,
        googleEmail: email,
        properties: properties.map((p) => p.siteUrl),
        propertyUrl: matched?.siteUrl ?? null,
        syncError: null,
      },
      create: {
        siteId,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: new Date(Date.now() + token.expires_in * 1000),
        scope: token.scope ?? GSC_SCOPE,
        googleEmail: email,
        properties: properties.map((p) => p.siteUrl),
        propertyUrl: matched?.siteUrl ?? null,
      },
    });

    if (!matched) return back(siteId, { gsc: 'no_property' });
    return back(siteId, { gsc: 'connected' });
  } catch (e) {
    return back(siteId, { gsc: 'error', reason: (e as Error).message.slice(0, 120) });
  }
};
