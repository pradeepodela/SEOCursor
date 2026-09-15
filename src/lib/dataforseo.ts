/**
 * DataForSEO — search volume, keyword difficulty and keyword discovery.
 *
 * Search Console tells you what a site already earns. It cannot tell you what
 * is out there and unclaimed, or how hard a term is to rank for. That is the
 * gap this fills: every keyword here carries a volume and a difficulty, so a
 * blog idea can be judged on demand rather than on a model's opinion.
 *
 * Credentials live in the environment, like the model keys, and never in the
 * database. Every call is metered and billed, so each one here is deliberate:
 * nothing polls, nothing refreshes in the background.
 */

import { loadEnv } from './env';

const BASE = 'https://api.dataforseo.com/v3';

export type Market = {
  locationCode: number;
  locationName: string;
  languageCode: string;
  languageName: string;
};

export const configured = (): boolean => {
  loadEnv();
  return !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
};

function authHeader(): string {
  loadEnv();
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    throw new Error('DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are not set — add them to .env to use keyword research');
  }
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
}

/**
 * DataForSEO answers 200 with the real outcome in the body, so the HTTP status
 * is not the thing to check. Task-level errors are what actually matter.
 */
async function call<T>(path: string, body?: unknown, timeoutMs = 60_000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: authHeader(), 'content-type': 'application/json' },
      // Every Labs endpoint takes an array of tasks; we only ever send one.
      body: body ? JSON.stringify([body]) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const err = e as Error;
    throw new Error(err.name === 'TimeoutError' ? 'DataForSEO took too long to respond' : err.message);
  }

  if (res.status === 401) throw new Error('DataForSEO rejected the credentials — check DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in .env');

  const json = await res.json().catch(() => null);
  if (!json) throw new Error(`DataForSEO returned ${res.status} with no JSON body`);

  if (json.status_code !== 20000) {
    throw new Error(`DataForSEO: ${json.status_message ?? `status ${json.status_code}`}`);
  }

  const task = json.tasks?.[0];
  if (!task) throw new Error('DataForSEO returned no task');
  if (task.status_code !== 20000) {
    throw new Error(`DataForSEO: ${task.status_message ?? `task status ${task.status_code}`}`);
  }

  return task.result as T;
}

// ---------------------------------------------------------------- account

export type Account = {
  ok: boolean;
  error?: string;
  balanceUsd?: number;
  login?: string;
};

/** Free call — confirms the credentials and shows what is left to spend. */
export async function verifyAccount(): Promise<Account> {
  if (!configured()) return { ok: false, error: 'DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are not set in .env' };
  try {
    const result = await call<any[]>('/appendix/user_data');
    const money = result?.[0]?.money;
    return {
      ok: true,
      balanceUsd: typeof money?.balance === 'number' ? money.balance : undefined,
      login: result?.[0]?.login,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------------------------------------------------------------- markets

export type LocationOption = {
  locationCode: number;
  locationName: string;
  countryIso: string;
  languages: { code: string; name: string }[];
};

/**
 * Free, and the reason the market picker is not a hard-coded list: location
 * codes are Google's and change, and a wrong one silently returns data for the
 * wrong country rather than an error.
 */
export async function locations(): Promise<LocationOption[]> {
  const result = await call<any[]>('/dataforseo_labs/locations_and_languages');
  return (result ?? [])
    .filter((l) => l.location_type === 'Country' && Array.isArray(l.available_languages))
    .map((l) => ({
      locationCode: l.location_code,
      locationName: l.location_name,
      countryIso: l.country_iso_code ?? '',
      languages: l.available_languages
        .filter((x: any) => x.available_sources?.includes('google') ?? true)
        .map((x: any) => ({ code: x.language_code, name: x.language_name })),
    }))
    .filter((l) => l.languages.length)
    .sort((a, b) => a.locationName.localeCompare(b.locationName));
}

// ---------------------------------------------------------------- keywords

export type ResearchedKeyword = {
  keyword: string;
  volume: number;
  difficulty: number | null;
  cpc: number;
  competition: number | null;
  /** Where the site currently sits for this term, when the source knows. */
  position: number | null;
};

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

function fromLabsItem(item: any): ResearchedKeyword {
  const info = item?.keyword_info ?? {};
  const props = item?.keyword_properties ?? {};
  return {
    keyword: String(item?.keyword ?? '').trim().toLowerCase(),
    volume: num(info.search_volume),
    difficulty: typeof props.keyword_difficulty === 'number' ? props.keyword_difficulty : null,
    cpc: num(info.cpc),
    competition: typeof info.competition === 'number' ? info.competition : null,
    position: null,
  };
}

const clean = (rows: ResearchedKeyword[]): ResearchedKeyword[] => {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (!r.keyword || seen.has(r.keyword)) return false;
    seen.add(r.keyword);
    return true;
  });
};

/** Keywords this domain already has some presence for. */
export async function keywordsForSite(domain: string, market: Market, limit = 200): Promise<ResearchedKeyword[]> {
  const result = await call<any[]>('/dataforseo_labs/google/keywords_for_site/live', {
    target: domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''),
    location_code: market.locationCode,
    language_code: market.languageCode,
    limit: Math.min(limit, 1000),
    include_serp_info: false,
    order_by: ['keyword_info.search_volume,desc'],
  });
  return clean((result?.[0]?.items ?? []).map(fromLabsItem));
}

/** Related terms for a handful of seeds. */
export async function keywordIdeas(seeds: string[], market: Market, limit = 200): Promise<ResearchedKeyword[]> {
  const keywords = seeds.map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 200);
  if (!keywords.length) return [];

  const result = await call<any[]>('/dataforseo_labs/google/keyword_ideas/live', {
    keywords,
    location_code: market.locationCode,
    language_code: market.languageCode,
    limit: Math.min(limit, 1000),
    include_serp_info: false,
    order_by: ['keyword_info.search_volume,desc'],
  });
  return clean((result?.[0]?.items ?? []).map(fromLabsItem));
}

/** Where the domain actually ranks, with positions. */
export async function rankedKeywords(domain: string, market: Market, limit = 200): Promise<ResearchedKeyword[]> {
  const result = await call<any[]>('/dataforseo_labs/google/ranked_keywords/live', {
    target: domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''),
    location_code: market.locationCode,
    language_code: market.languageCode,
    limit: Math.min(limit, 1000),
    order_by: ['ranked_serp_element.serp_item.rank_group,asc'],
  });

  return clean((result?.[0]?.items ?? []).map((item: any) => {
    const kw = fromLabsItem(item?.keyword_data ?? {});
    const rank = item?.ranked_serp_element?.serp_item?.rank_group;
    return { ...kw, position: typeof rank === 'number' ? rank : null };
  }));
}

/**
 * Difficulty for terms we already have — the cheap way to grade Search Console
 * queries, which arrive with impressions and positions but no competitiveness.
 * Up to 1000 per request, so batching keeps the bill to one call per 1000.
 */
export async function bulkDifficulty(keywords: string[], market: Market): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const unique = [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))];

  for (let i = 0; i < unique.length; i += 1000) {
    const batch = unique.slice(i, i + 1000);
    const result = await call<any[]>('/dataforseo_labs/google/bulk_keyword_difficulty/live', {
      keywords: batch,
      location_code: market.locationCode,
      language_code: market.languageCode,
    });
    for (const item of result?.[0]?.items ?? []) {
      if (typeof item?.keyword_difficulty === 'number') {
        out.set(String(item.keyword).toLowerCase(), item.keyword_difficulty);
      }
    }
  }

  return out;
}
