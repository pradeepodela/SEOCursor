/**
 * Search Console tools.
 *
 * The crawl sees what exists; only Google can say what it earns. Every number
 * here came from Search Console — none of it is modelled or estimated, and
 * where Search Console is not connected the tools say so rather than returning
 * an empty list that reads like "you rank for nothing".
 */

import { z } from 'zod4';
import type { McpServer } from '@modelcontextprotocol/server';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { db } from '../../lib/db';
import { syncSearchConsole, GscNotReady } from '../../lib/gscSync';
import { resolveSite, result, guard, McpToolError, num, round1 } from '../context';
import { UI } from '../apps/registry';

const siteArg = z
  .string()
  .optional()
  .describe('Domain of the connected website, e.g. "example.com". Omit when only one is connected.');

/** Fail with advice rather than an empty result when GSC was never connected. */
async function requireGsc(siteId: string, domain: string) {
  const conn = await db.gscConnection.findUnique({ where: { siteId } });
  if (!conn) {
    throw new McpToolError(
      `Search Console is not connected for ${domain}, so there is no ranking data to read. Connect it in the workspace under Settings — the crawl can show what exists on the site, but only Google can say what it earns.`,
    );
  }
  return conn;
}

export function registerSearchTools(server: McpServer): void {
  // ------------------------------------------------------------- rankings (app)

  registerAppTool(
    server,
    'get_rankings',
    {
      title: 'Search rankings',
      description:
        'Queries this website ranks for, with impressions, clicks and average position from Search Console. Sorted by opportunity by default — high impressions just off page one first.',
      inputSchema: z.object({
        site: siteArg,
        filter: z.string().optional().describe('Only queries containing this text.'),
        opportunity: z
          .enum(['HIGH', 'MEDIUM', 'LOW', 'ALL'])
          .default('ALL')
          .describe('HIGH is where the cheap wins are: real impressions, position just off page one.'),
        sort: z.enum(['opportunity', 'impressions', 'clicks', 'position']).default('opportunity'),
        limit: z.number().int().min(1).max(500).default(100),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: UI.rankings } },
    },
    guard(async ({ site: ref, filter, opportunity, sort, limit }) => {
      const site = await resolveSite(ref);
      const conn = await requireGsc(site.id, site.domain);

      const where = {
        siteId: site.id,
        ...(filter ? { keyword: { contains: filter, mode: 'insensitive' as const } } : {}),
        ...(opportunity === 'ALL' ? {} : { opportunity }),
      };

      const orderBy =
        sort === 'impressions'
          ? [{ impressions: 'desc' as const }]
          : sort === 'clicks'
            ? [{ clicks: 'desc' as const }]
            : sort === 'position'
              ? [{ position: 'asc' as const }]
              : [{ opportunity: 'asc' as const }, { impressions: 'desc' as const }];

      const [rows, total] = await Promise.all([
        db.keyword.findMany({ where, orderBy, take: limit, include: { page: { select: { url: true } } } }),
        db.keyword.count({ where }),
      ]);

      if (!total) {
        throw new McpToolError(
          `No Search Console queries recorded for ${site.domain}${filter ? ` matching "${filter}"` : ''}.` +
            (conn.lastSyncAt
              ? ` Last synced ${conn.lastSyncAt.toISOString().slice(0, 10)}.`
              : ' This connection has never been synced — run `sync_search_console` first.'),
        );
      }

      // Page two is the headline number: those are the queries where a small
      // improvement moves real impressions onto page one.
      const nearMiss = rows.filter((r) => r.position !== null && r.position > 10 && r.position <= 20);
      const noClicks = rows.filter((r) => r.clicks === 0 && r.impressions >= 50);

      return result({
        summary:
          `${num(total)} queries for ${site.domain}${filter ? ` matching "${filter}"` : ''}, showing ${num(rows.length)}.\n` +
          rows
            .slice(0, 10)
            .map(
              (r) =>
                `- "${r.keyword}" — position ${r.position ? round1(r.position) : '?'}, ${num(r.impressions)} impressions, ${num(r.clicks)} clicks`,
            )
            .join('\n') +
          (rows.length > 10 ? `\n…and ${num(rows.length - 10)} more.` : '') +
          `\n${num(nearMiss.length)} of these sit on page two, and ${num(noClicks.length)} earn impressions but no clicks — those two groups are the cheapest wins available.`,
        data: {
          site: { domain: site.domain },
          property: conn.propertyUrl,
          lastSyncAt: conn.lastSyncAt?.toISOString() ?? null,
          total,
          shown: rows.length,
          nearMiss: nearMiss.length,
          noClicks: noClicks.length,
          keywords: rows.map((r) => ({
            keyword: r.keyword,
            position: r.position ? round1(r.position) : null,
            impressions: r.impressions,
            clicks: r.clicks,
            ctr: r.impressions ? round1((r.clicks / r.impressions) * 100) : 0,
            intent: r.intent,
            opportunity: r.opportunity,
            volume: r.volume || null,
            difficulty: r.difficulty || null,
            source: r.source,
            url: r.page?.url ?? null,
          })),
        },
      });
    }),
  );

  // ------------------------------------------------------------- per-page

  server.registerTool(
    'get_page_performance',
    {
      title: 'Page search performance',
      description: 'Per-URL impressions, clicks and average position from Search Console.',
      inputSchema: z.object({
        site: siteArg,
        url: z.string().optional().describe('One URL, or part of one. Omit for the whole site.'),
        limit: z.number().int().min(1).max(200).default(50),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(async ({ site: ref, url, limit }) => {
      const site = await resolveSite(ref);
      await requireGsc(site.id, site.domain);

      const rows = await db.page.findMany({
        where: {
          siteId: site.id,
          crawledAt: { not: null },
          ...(url ? { url: { contains: url, mode: 'insensitive' } } : {}),
        },
        orderBy: [{ impressions: 'desc' }],
        take: limit,
      });

      if (!rows.length) throw new McpToolError(`No crawled page on ${site.domain} matches "${url ?? ''}".`);

      const withData = rows.filter((p) => p.impressions > 0);

      return result({
        summary:
          `${num(withData.length)} of ${num(rows.length)} pages earned impressions.\n` +
          withData
            .slice(0, 10)
            .map(
              (p) =>
                `- ${p.url} — ${num(p.impressions)} impressions, ${num(p.clicks)} clicks, position ${p.position ? round1(p.position) : '?'}`,
            )
            .join('\n') +
          (withData.length === 0 ? 'None of these pages earned an impression in the synced window.' : ''),
        data: {
          site: { domain: site.domain },
          shown: rows.length,
          withImpressions: withData.length,
          pages: rows.map((p) => ({
            url: p.url,
            title: p.title,
            impressions: p.impressions,
            clicks: p.clicks,
            position: p.position ? round1(p.position) : null,
            ctr: p.impressions ? round1((p.clicks / p.impressions) * 100) : 0,
            keywordCount: p.keywordCount,
            wordCount: p.wordCount,
          })),
        },
      });
    }),
  );

  // ------------------------------------------------------------- sync

  server.registerTool(
    'sync_search_console',
    {
      title: 'Sync Search Console',
      description:
        'Pull a fresh window of Search Console data into the workspace and match it onto crawled URLs. Replaces the stored keyword set for this website.',
      inputSchema: z.object({
        site: siteArg,
        days: z.number().int().min(1).max(480).default(90).describe('How many days back to pull.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    guard(async ({ site: ref, days }) => {
      const site = await resolveSite(ref);
      try {
        const r = await syncSearchConsole(site.id, days);
        return result({
          summary:
            `Synced ${r.window.days} days of ${r.property} (${r.window.startDate} to ${r.window.endDate}): ` +
            `${num(r.keywords)} queries, ${num(r.impressions)} impressions, ${num(r.clicks)} clicks. ` +
            `${num(r.pagesMatchedToCrawl)} of ${num(r.pagesInGsc)} URLs Google reported matched a crawled page` +
            (r.pagesMatchedToCrawl < r.pagesInGsc
              ? ' — the rest are URLs the crawl has not reached, usually because it stopped at its page cap.'
              : '.'),
          data: r,
        });
      } catch (e) {
        if (e instanceof GscNotReady) throw new McpToolError(`${e.message} for ${site.domain}.`);
        throw e;
      }
    }),
  );
}
