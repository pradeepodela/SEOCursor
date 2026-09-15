import { z } from 'zod';

/** Shared enums, mirrored from the Prisma schema. */
export const zOpportunityType = z.enum(['NEW_CONTENT', 'UPDATE_PAGE', 'INTERNAL_LINKING', 'TECHNICAL', 'KEYWORD', 'COMPETITOR']);
export const zImpact = z.enum(['HIGH', 'MEDIUM', 'LOW']);
export const zEffort = zImpact;
export const zSeverity = z.enum(['CRITICAL', 'WARNING', 'PASSED']);
export const zCalendarType = z.enum(['BLOG', 'PAGE', 'UPDATE', 'INTERNAL_LINKING', 'TECHNICAL', 'REFRESH']);
export const zWorkStatus = z.enum(['PLANNED', 'IN_PROGRESS', 'DONE', 'DISMISSED']);
export const zContentStatus = z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'UPDATE']);
export const zIntent = z.enum(['INFORMATIONAL', 'COMMERCIAL', 'TRANSACTIONAL', 'NAVIGATIONAL']);

const cuid = z.string().min(1, 'required');

/** A site URL typed by a human: tolerate a missing scheme. */
export const zSiteUrl = z
  .string()
  .trim()
  .min(3, 'Enter a website URL')
  .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.hostname.includes('.') && !u.hostname.endsWith('.');
    } catch {
      return false;
    }
  }, 'That does not look like a valid website URL');

// ---------------------------------------------------------------- onboarding

export const zConnectSite = z.object({
  url: zSiteUrl,
  competitors: z.array(zSiteUrl).max(8, 'Up to 8 competitors').default([]),
  maxPages: z.coerce.number().int().min(1).max(500).default(150),
});
export type ConnectSiteInput = z.infer<typeof zConnectSite>;

// ---------------------------------------------------------------- crawl

export const zStartCrawl = z.object({
  siteId: cuid,
  /** Page cap for this run. Kept modest by default so a crawl stays polite. */
  maxPages: z.coerce.number().int().min(1).max(500).default(150),
});

export const zCrawlStatus = z.object({ id: cuid });

// ---------------------------------------------------------------- ideas & blogs

export const zIdeaStatus = z.enum(['SUGGESTED', 'SCHEDULED', 'GENERATING', 'DRAFTED', 'PUBLISHED', 'DISMISSED']);

export const zGenerateIdeas = z.object({
  siteId: cuid,
  count: z.coerce.number().int().min(1).max(25).default(10),
});

export const zAddIdea = z.object({
  siteId: cuid,
  title: z.string().trim().min(5, 'Give the post a title').max(180),
  targetQuery: z.string().trim().max(160).optional(),
  angle: z.string().trim().max(400).optional(),
  rationale: z.string().trim().max(800).optional(),
});

export const zUpdateIdea = z.object({
  id: cuid,
  title: z.string().trim().min(5).max(180).optional(),
  targetQuery: z.string().trim().max(160).nullable().optional(),
  status: zIdeaStatus.optional(),
  score: z.coerce.number().int().min(0).max(100).optional(),
});

export const zScheduleIdea = z.object({
  siteId: cuid,
  ideaId: cuid,
  date: z.coerce.date(),
  autoGenerate: z.boolean().default(true),
  autoPublish: z.boolean().default(false),
});

export const zGenerateBlog = z.object({
  siteId: cuid,
  ideaId: cuid,
});

export const zPublishToWp = z.object({
  contentId: cuid,
  status: z.enum(['draft', 'publish', 'pending']).default('publish'),
  confirm: z.literal(true),
});

export const zWpConnect = z.object({
  siteId: cuid,
  baseUrl: zSiteUrl,
  username: z.string().trim().min(1, 'WordPress username required').max(120),
  appPassword: z.string().trim().min(8, 'Application passwords are at least 8 characters').max(200),
  defaultStatus: z.enum(['draft', 'publish', 'pending']).default('draft'),
  defaultCategory: z.coerce.number().int().positive().nullable().optional(),
});

export const zWpDisconnect = z.object({ siteId: cuid, confirm: z.literal(true) });

export const zSetModels = z.object({
  siteId: cuid,
  ideaModel: z.string().trim().min(3).max(120).optional(),
  draftModel: z.string().trim().min(3).max(120).optional(),
});

// ---------------------------------------------------------------- keywords

export const zKeywordMarket = z.object({
  siteId: cuid,
  locationCode: z.coerce.number().int().positive('Pick a country'),
  locationName: z.string().trim().min(1).max(120),
  languageCode: z.string().trim().min(2).max(12),
  languageName: z.string().trim().min(1).max(120),
});

/**
 * Every research mode is a billed call, so the caller has to say which one it
 * wants and how many rows — no implicit "fetch everything".
 */
export const zKeywordResearch = z.object({
  siteId: cuid,
  mode: z.enum(['site', 'ranked', 'seeds']),
  seeds: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  limit: z.coerce.number().int().min(10).max(1000).default(200),
}).refine((v) => v.mode !== 'seeds' || v.seeds.length > 0, {
  message: 'Give at least one seed keyword',
  path: ['seeds'],
});

export const zKeywordEnrich = z.object({
  siteId: cuid,
  limit: z.coerce.number().int().min(1).max(1000).default(300),
});

export const zKeywordTrack = z.object({
  siteId: cuid,
  keywordIds: z.array(cuid).min(1).max(200),
  tracked: z.boolean(),
});

export const zKeywordDisconnect = z.object({ siteId: cuid, confirm: z.literal(true) });

// ---------------------------------------------------------------- google

export const zGscSync = z.object({
  siteId: cuid,
  days: z.coerce.number().int().min(1).max(480).default(90),
});

export const zGscSelectProperty = z.object({
  siteId: cuid,
  propertyUrl: z.string().trim().min(1).max(300),
});

export const zGscDisconnect = z.object({
  siteId: cuid,
  confirm: z.literal(true),
});

// ---------------------------------------------------------------- assistant

export const zAskAssistant = z.object({
  siteId: cuid,
  message: z.string().trim().min(1, 'Message cannot be empty').max(2000),
  persist: z.boolean().default(true),
});
export type AskAssistantInput = z.infer<typeof zAskAssistant>;

// ---------------------------------------------------------------- briefs & content

export const zCreateBrief = z.object({
  siteId: cuid,
  opportunityId: cuid.optional(),
  targetKeyword: z.string().trim().min(2).max(120).optional(),
});

export const zGenerateArticle = z.object({
  siteId: cuid,
  briefId: cuid,
});

export const zUpdateContent = z.object({
  id: cuid,
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().max(200_000).optional(),
  status: zContentStatus.optional(),
});

export const zPublishContent = z.object({
  id: cuid,
  /** Publishing is outward-facing, so the client has to mean it. */
  confirm: z.literal(true),
});

// ---------------------------------------------------------------- work items

export const zApplyRecommendation = z.object({
  id: cuid,
  applied: z.boolean().default(true),
});

export const zResolveIssue = z.object({
  id: cuid,
  resolved: z.boolean().default(true),
});

export const zUpdateOpportunity = z.object({
  id: cuid,
  status: zWorkStatus,
});

export const zCreateCalendarItem = z.object({
  siteId: cuid,
  date: z.coerce.date(),
  type: zCalendarType,
  title: z.string().trim().min(1).max(160),
  targetUrl: z.string().trim().max(400).optional().nullable(),
  opportunityId: cuid.optional().nullable(),
});

export const zMoveCalendarItem = z.object({
  id: cuid,
  date: z.coerce.date().optional(),
  status: zWorkStatus.optional(),
});

export const zGenerateWeek = z.object({
  siteId: cuid,
  from: z.coerce.date().optional(),
});

// ---------------------------------------------------------------- filters

export const zListQuery = z.object({
  siteId: cuid,
  type: z.string().optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ---------------------------------------------------------------- helpers

export type ApiError = { ok: false; error: string; issues?: { path: string; message: string }[] };
export type ApiOk<T> = { ok: true; data: T };

export function fail(error: string, status = 400, issues?: ApiError['issues']): Response {
  return new Response(JSON.stringify({ ok: false, error, issues } satisfies ApiError), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function ok<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, data } satisfies ApiOk<T>), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Parse a JSON request body against a Zod schema, returning a typed result or a 400 Response. */
export async function parseBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<{ data: z.infer<S>; res?: never } | { data?: never; res: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { res: fail('Request body must be valid JSON') };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      res: fail(
        'Validation failed',
        422,
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      ),
    };
  }
  return { data: parsed.data };
}

/** Parse URL search params against a Zod schema. */
export function parseQuery<S extends z.ZodTypeAny>(
  url: URL,
  schema: S,
): { data: z.infer<S>; res?: never } | { data?: never; res: Response } {
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return {
      res: fail(
        'Invalid query parameters',
        422,
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      ),
    };
  }
  return { data: parsed.data };
}
