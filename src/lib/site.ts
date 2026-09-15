import { db } from './db';
import type { AstroGlobal } from 'astro';

export const SITE_COOKIE = 'sc_site';

/**
 * Resolve which website the workspace is pointed at.
 * ?site=<id> switches and persists; otherwise fall back to the cookie, then
 * the primary site.
 */
export async function resolveSite(Astro: AstroGlobal) {
  const sites = await db.site.findMany({ orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] });
  if (!sites.length) return { sites: [], site: null };

  const fromQuery = Astro.url.searchParams.get('site');
  const fromCookie = Astro.cookies.get(SITE_COOKIE)?.value;

  const site =
    sites.find((s) => s.id === fromQuery) ??
    sites.find((s) => s.id === fromCookie) ??
    sites[0];

  // Persist the choice. Both the page and the layout resolve the site, and by
  // the time the layout runs Astro has started streaming, so a second write
  // would throw ResponseSentError. Only the first caller succeeds, which is
  // exactly what we want.
  if (fromQuery && site.id === fromQuery && fromCookie !== site.id) {
    try {
      Astro.cookies.set(SITE_COOKIE, site.id, {
        path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365,
      });
    } catch {
      // Response already streaming — the page frontmatter set it first.
    }
  }

  return { sites, site };
}

/** Counts used for the sidebar badges — all from real data. */
export async function navCounts(siteId: string) {
  const [issues, criticalIssues, pages, keywords, ideas, drafts, scheduled] = await Promise.all([
    db.auditIssue.count({ where: { siteId, resolved: false } }),
    db.auditIssue.count({ where: { siteId, resolved: false, severity: 'CRITICAL' } }),
    db.page.count({ where: { siteId, crawledAt: { not: null } } }),
    db.keyword.count({ where: { siteId } }),
    db.blogIdea.count({ where: { siteId, status: 'SUGGESTED' } }),
    db.contentPiece.count({ where: { siteId } }),
    db.calendarItem.count({ where: { siteId, status: { in: ['PLANNED', 'IN_PROGRESS'] } } }),
  ]);
  return { issues, criticalIssues, pages, keywords, ideas, drafts, scheduled };
}
