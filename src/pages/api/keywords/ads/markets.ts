import type { APIRoute } from 'astro';
import { ADS_COUNTRIES, ADS_LANGUAGES, DEFAULT_LANGUAGE_BY_ISO } from '../../../../lib/googleAdsGeo';
import { adsConfigured } from '../../../../lib/googleAds';
import { ok } from '../../../../lib/schemas';

export const prerender = false;

/**
 * The country/language options for the Keyword Planner market picker. Static —
 * Google's constants are stable — so no billed or authenticated call is needed
 * just to render the dropdowns.
 */
export const GET: APIRoute = async () =>
  ok({
    configured: adsConfigured(),
    countries: ADS_COUNTRIES,
    languages: ADS_LANGUAGES,
    defaultLanguageByIso: DEFAULT_LANGUAGE_BY_ISO,
  });
