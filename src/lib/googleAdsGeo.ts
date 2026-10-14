/**
 * Google Ads geo-target and language constants for the market picker.
 *
 * Google Ads identifies a market by a geoTargetConstant (a country here) and a
 * languageConstant. The full lists run to tens of thousands of rows behind the
 * API; this is a curated set of the countries and languages a keyword tool
 * actually needs, so the dropdowns work without a billed lookup.
 *
 * IDs are Google's own constants (stable). Country IDs:
 * https://developers.google.com/google-ads/api/reference/data/geotargets
 * Language IDs:
 * https://developers.google.com/google-ads/api/reference/data/codes-formats#languages
 */

export type AdsCountry = { geoTarget: number; name: string; iso: string };
export type AdsLanguage = { id: number; name: string };

export const ADS_COUNTRIES: AdsCountry[] = [
  { geoTarget: 2036, name: 'Australia', iso: 'AU' },
  { geoTarget: 2040, name: 'Austria', iso: 'AT' },
  { geoTarget: 2056, name: 'Belgium', iso: 'BE' },
  { geoTarget: 2076, name: 'Brazil', iso: 'BR' },
  { geoTarget: 2124, name: 'Canada', iso: 'CA' },
  { geoTarget: 2152, name: 'Chile', iso: 'CL' },
  { geoTarget: 2170, name: 'Colombia', iso: 'CO' },
  { geoTarget: 2208, name: 'Denmark', iso: 'DK' },
  { geoTarget: 2246, name: 'Finland', iso: 'FI' },
  { geoTarget: 2250, name: 'France', iso: 'FR' },
  { geoTarget: 2276, name: 'Germany', iso: 'DE' },
  { geoTarget: 2300, name: 'Greece', iso: 'GR' },
  { geoTarget: 2344, name: 'Hong Kong', iso: 'HK' },
  { geoTarget: 2356, name: 'India', iso: 'IN' },
  { geoTarget: 2360, name: 'Indonesia', iso: 'ID' },
  { geoTarget: 2372, name: 'Ireland', iso: 'IE' },
  { geoTarget: 2376, name: 'Israel', iso: 'IL' },
  { geoTarget: 2380, name: 'Italy', iso: 'IT' },
  { geoTarget: 2392, name: 'Japan', iso: 'JP' },
  { geoTarget: 2458, name: 'Malaysia', iso: 'MY' },
  { geoTarget: 2484, name: 'Mexico', iso: 'MX' },
  { geoTarget: 2528, name: 'Netherlands', iso: 'NL' },
  { geoTarget: 2554, name: 'New Zealand', iso: 'NZ' },
  { geoTarget: 2578, name: 'Norway', iso: 'NO' },
  { geoTarget: 2608, name: 'Philippines', iso: 'PH' },
  { geoTarget: 2616, name: 'Poland', iso: 'PL' },
  { geoTarget: 2620, name: 'Portugal', iso: 'PT' },
  { geoTarget: 2642, name: 'Romania', iso: 'RO' },
  { geoTarget: 2682, name: 'Saudi Arabia', iso: 'SA' },
  { geoTarget: 2702, name: 'Singapore', iso: 'SG' },
  { geoTarget: 2710, name: 'South Africa', iso: 'ZA' },
  { geoTarget: 2410, name: 'South Korea', iso: 'KR' },
  { geoTarget: 2724, name: 'Spain', iso: 'ES' },
  { geoTarget: 2752, name: 'Sweden', iso: 'SE' },
  { geoTarget: 2756, name: 'Switzerland', iso: 'CH' },
  { geoTarget: 2764, name: 'Thailand', iso: 'TH' },
  { geoTarget: 2792, name: 'Turkey', iso: 'TR' },
  { geoTarget: 2784, name: 'United Arab Emirates', iso: 'AE' },
  { geoTarget: 2826, name: 'United Kingdom', iso: 'GB' },
  { geoTarget: 2840, name: 'United States', iso: 'US' },
  { geoTarget: 2704, name: 'Vietnam', iso: 'VN' },
];

export const ADS_LANGUAGES: AdsLanguage[] = [
  { id: 1000, name: 'English' },
  { id: 1001, name: 'German' },
  { id: 1002, name: 'French' },
  { id: 1003, name: 'Spanish' },
  { id: 1004, name: 'Italian' },
  { id: 1005, name: 'Japanese' },
  { id: 1009, name: 'Danish' },
  { id: 1010, name: 'Dutch' },
  { id: 1011, name: 'Finnish' },
  { id: 1012, name: 'Korean' },
  { id: 1013, name: 'Norwegian' },
  { id: 1014, name: 'Portuguese' },
  { id: 1015, name: 'Swedish' },
  { id: 1017, name: 'Chinese (simplified)' },
  { id: 1019, name: 'Arabic' },
  { id: 1022, name: 'Polish' },
  { id: 1024, name: 'Turkish' },
  { id: 1028, name: 'Thai' },
  { id: 1032, name: 'Romanian' },
  { id: 1035, name: 'Indonesian' },
  { id: 1037, name: 'Hebrew' },
  { id: 1038, name: 'Vietnamese' },
  { id: 1056, name: 'Greek' },
];

/** A sensible default language for a country, so picking a country pre-fills one. */
export const DEFAULT_LANGUAGE_BY_ISO: Record<string, number> = {
  AT: 1001, DE: 1001, CH: 1001,
  FR: 1002, BE: 1002,
  ES: 1003, MX: 1003, CL: 1003, CO: 1003,
  IT: 1004, JP: 1005, DK: 1009, NL: 1010, FI: 1011, KR: 1012,
  NO: 1013, BR: 1014, PT: 1014, SE: 1015, PL: 1022, TR: 1024,
  TH: 1028, RO: 1032, ID: 1035, IL: 1037, VN: 1038, GR: 1056,
  SA: 1019, AE: 1019,
};
