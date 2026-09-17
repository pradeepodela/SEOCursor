/**
 * Keyword research tools.
 *
 * Every call here is billed by DataForSEO, so nothing fetches implicitly: the
 * caller states the mode and the row count, exactly as the workspace panel
 * requires. An agent that can quietly run "fetch everything" against a metered
 * API is a bill waiting to happen.
 */

import { z } from 'zod4';
import type { McpServer } from '@modelcontextprotocol/server';
import { db } from '../../lib/db';
import { research, enrich, marketFor } from '../../lib/keywords';
import { resolveSite, result, guard, McpToolError, num, round1 } from '../context';

const siteArg = z
  .string()
  .optional()
  .describe('Domain of the connected website, e.g. "example.com". Omit when only one is connected.');

async function requireProvider(siteId: string, domain: string) {
  const conn = await db.dataForSeoConnection.findUnique({ where: { siteId } });
  if (!conn) {
    throw new McpToolError(
      `No keyword provider is connected for ${domain}. Search volume and difficulty need a third-party source — connect DataForSEO in the workspace under Settings. Search Console data (\`get_rankings\`) works without it, but reports impressions and position only, never volume.`,
    );
  }
  const market = await marketFor(siteId);
  if (!market) throw new McpToolError(`Pick a market (country and language) for ${domain} in Settings before running keyword research.`);
  return { conn, market };
}

export function registerKeywordTools(server: McpServer): void {
  server.registerTool(
    'get_keywords',
    {
      title: 'Stored keywords',
      description:
        'Keywords stored for this website. Rows sourced from Search Console carry impressions and position but no volume; rows from a keyword provider carry volume and difficulty. The source is always stated so a merged row is never mistaken for one measured end to end.',
      inputSchema: z.object({
        site: siteArg,
        q: z.string().optional().describe('Filter on the keyword text.'),
        tracked: z.boolean().optional().describe('Only keywords marked as tracked.'),
        minVolume: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(500).default(100),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(async ({ site: ref, q, tracked, minVolume, limit }) => {
      const site = await resolveSite(ref);
      const where = {
        siteId: site.id,
        ...(q ? { keyword: { contains: q, mode: 'insensitive' as const } } : {}),
        ...(tracked === undefined ? {} : { tracked }),
        ...(minVolume ? { volume: { gte: minVolume } } : {}),
      };

      const [rows, total] = await Promise.all([
        db.keyword.findMany({
          where,
          orderBy: [{ volume: 'desc' }, { impressions: 'desc' }],
          take: limit,
          include: { page: { select: { url: true } } },
        }),
        db.keyword.count({ where }),
      ]);

      if (!total) throw new McpToolError(`No stored keywords for ${site.domain}${q ? ` matching "${q}"` : ''}.`);

      const withVolume = rows.filter((r) => r.volume > 0).length;

      return result({
        summary:
          `${num(total)} keywords for ${site.domain}, showing ${num(rows.length)}. ` +
          `${num(withVolume)} have search volume from a keyword provider; the rest are Search Console rows, which carry impressions and position but never volume.\n` +
          rows
            .slice(0, 10)
            .map(
              (r) =>
                `- "${r.keyword}" — ${r.volume ? `${num(r.volume)}/mo, difficulty ${r.difficulty}` : 'volume unknown'}, ` +
                `position ${r.position ? round1(r.position) : '?'}, ${num(r.impressions)} impressions`,
            )
            .join('\n'),
        data: {
          site: { domain: site.domain },
          total,
          shown: rows.length,
          withVolume,
          keywords: rows.map((r) => ({
            keyword: r.keyword,
            volume: r.volume || null,
            difficulty: r.difficulty || null,
            cpc: r.cpc || null,
            intent: r.intent,
            position: r.position ? round1(r.position) : null,
            impressions: r.impressions,
            clicks: r.clicks,
            opportunity: r.opportunity,
            source: r.source,
            tracked: r.tracked,
            url: r.page?.url ?? null,
          })),
        },
      });
    }),
  );

  server.registerTool(
    'research_keywords',
    {
      title: 'Research keywords',
      description:
        'Pull fresh keyword data from the connected provider. Mode "site" finds what the domain could rank for, "ranked" what it already ranks for, "seeds" expands the keywords you supply. Each call is billed, so state the mode and row count deliberately.',
      inputSchema: z.object({
        site: siteArg,
        mode: z.enum(['site', 'ranked', 'seeds']),
        seeds: z.array(z.string()).max(20).default([]).describe('Required when mode is "seeds".'),
        limit: z.number().int().min(10).max(1000).default(200).describe('Rows to pull. This is a billed quantity.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    guard(async ({ site: ref, mode, seeds, limit }) => {
      const site = await resolveSite(ref);
      await requireProvider(site.id, site.domain);
      if (mode === 'seeds' && !seeds.length) throw new McpToolError('Mode "seeds" needs at least one seed keyword.');

      const r = await research(site.id, mode, seeds, limit);
      return result({
        summary:
          `Keyword research on ${site.domain} in ${r.market} (mode "${r.mode}"): ${num(r.found)} rows returned, ` +
          `${num(r.created)} new keywords stored and ${num(r.updated)} existing ones updated.`,
        data: { site: { domain: site.domain }, ...r },
      });
    }),
  );

  server.registerTool(
    'enrich_keywords',
    {
      title: 'Enrich Search Console keywords',
      description:
        'Grade stored Search Console queries with volume and difficulty from the keyword provider. Search Console never supplies those, so without this there is no way to tell a near-miss worth chasing from one the whole industry is guarding. Billed per call.',
      inputSchema: z.object({
        site: siteArg,
        limit: z.number().int().min(1).max(1000).default(300).describe('How many ungraded keywords to grade.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    guard(async ({ site: ref, limit }) => {
      const site = await resolveSite(ref);
      await requireProvider(site.id, site.domain);

      const r = await enrich(site.id, limit);
      return result({
        summary: r.checked
          ? `Checked ${num(r.checked)} keywords on ${site.domain} and graded ${num(r.graded)} with volume and difficulty.`
          : `Nothing to grade on ${site.domain} — every stored keyword already has volume and difficulty.`,
        data: { site: { domain: site.domain }, ...r },
      });
    }),
  );
}
