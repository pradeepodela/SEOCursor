import type { APIRoute } from 'astro';
import { locations, configured, isUnverified } from '../../../lib/dataforseo';
import { ok, fail } from '../../../lib/schemas';

export const prerender = false;

/**
 * Markets available to pick from. Free at the provider, but a few hundred rows,
 * so it is cached for the life of the process rather than fetched per render.
 */
let cache: { at: number; data: Awaited<ReturnType<typeof locations>> } | null = null;
const TTL = 12 * 60 * 60 * 1000;

export const GET: APIRoute = async () => {
  if (!configured()) return fail('Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to .env to choose a market', 503);

  if (cache && Date.now() - cache.at < TTL) return ok({ locations: cache.data, cached: true });

  try {
    const data = await locations();
    cache = { at: Date.now(), data };
    return ok({ locations: data, cached: false });
  } catch (e) {
    const msg = (e as Error).message;
    return fail(msg, isUnverified(msg) ? 403 : 502);
  }
};
