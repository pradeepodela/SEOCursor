/**
 * Audit tools: findings, links, and broken links.
 *
 * The link verdict vocabulary is preserved exactly as the crawler recorded it.
 * `blocked` and `unreachable` are not `broken` — bot protection routinely
 * answers 403 or 429 to a crawler while serving people fine, and an agent that
 * flattens those into "broken link" will tell the user to delete links that
 * work.
 */

import { z } from 'zod4';
import type { McpServer } from '@modelcontextprotocol/server';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { db } from '../../lib/db';
import { resolveSite, result, guard, McpToolError, num } from '../context';
import { UI } from '../apps/registry';

const siteArg = z
  .string()
  .optional()
  .describe('Domain of the connected website, e.g. "example.com". Omit when only one is connected.');

export function registerAuditTools(server: McpServer): void {
  // ------------------------------------------------------------- findings (app)

  registerAppTool(
    server,
    'audit_site',
    {
      title: 'Audit findings',
      description:
        'Open audit findings grouped by severity and category, each with why it matters, the recommended fix, and the URLs it affects.',
      inputSchema: z.object({
        site: siteArg,
        severity: z
          .enum(['CRITICAL', 'WARNING', 'ALL'])
          .default('ALL')
          .describe('Filter by severity.'),
        category: z.string().optional().describe('Filter by category, e.g. "Technical", "Content", "Schema".'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: UI.audit } },
    },
    guard(async ({ site: ref, severity, category }) => {
      const site = await resolveSite(ref);

      const rows = await db.auditIssue.findMany({
        where: {
          siteId: site.id,
          resolved: false,
          ...(severity === 'ALL' ? {} : { severity }),
          ...(category ? { category: { equals: category, mode: 'insensitive' } } : {}),
        },
        orderBy: [{ severity: 'asc' }, { affectedCount: 'desc' }],
      });

      const passed = await db.auditIssue.count({ where: { siteId: site.id, severity: 'PASSED' } });

      if (!rows.length) {
        const crawled = await db.site.findUnique({ where: { id: site.id }, select: { lastCrawlAt: true } });
        if (!crawled?.lastCrawlAt) throw new McpToolError(`${site.domain} has not been crawled yet. Run \`crawl_site\` first.`);
        return result({
          summary: `No open findings on ${site.domain}${severity === 'ALL' ? '' : ` at severity ${severity}`}${category ? ` in category ${category}` : ''}.`,
          data: { site: { domain: site.domain }, total: 0, passed, issues: [], byCategory: {} },
        });
      }

      const critical = rows.filter((r) => r.severity === 'CRITICAL');
      const warnings = rows.filter((r) => r.severity === 'WARNING');

      const byCategory: Record<string, number> = {};
      for (const r of rows) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;

      // Lead with the findings that affect the most pages: one dead footer
      // link across 21 pages is a bigger job than 21 unrelated one-offs.
      const headline = rows
        .slice(0, 8)
        .map((r) => `- [${r.severity}] ${r.title} — ${num(r.affectedCount)} page${r.affectedCount === 1 ? '' : 's'}. ${r.recommendedAction}`)
        .join('\n');

      return result({
        summary:
          `${site.domain}: ${num(rows.length)} open findings — ${num(critical.length)} critical, ${num(warnings.length)} warnings, ${num(passed)} checks passed.\n` +
          `${headline}${rows.length > 8 ? `\n…and ${num(rows.length - 8)} more.` : ''}`,
        data: {
          site: { domain: site.domain },
          total: rows.length,
          critical: critical.length,
          warnings: warnings.length,
          passed,
          byCategory,
          issues: rows.map((r) => ({
            id: r.id,
            code: r.code,
            title: r.title,
            category: r.category,
            severity: r.severity,
            affectedUrl: r.affectedUrl,
            affectedCount: r.affectedCount,
            samples: r.samples,
            whyItMatters: r.whyItMatters,
            recommendedAction: r.recommendedAction,
            aiFixable: r.aiFixable,
            resolved: r.resolved,
          })),
        },
      });
    }),
  );

  // ------------------------------------------------------------- resolve

  server.registerTool(
    'resolve_issue',
    {
      title: 'Mark a finding resolved',
      description:
        'Mark an audit finding as resolved once it has been fixed. Re-crawling replaces crawl-derived findings automatically, so use this for fixes made outside a crawl.',
      inputSchema: z.object({
        issueId: z.string().describe('Finding id, from `audit_site`.'),
        resolved: z.boolean().default(true),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    guard(async ({ issueId, resolved }) => {
      const existing = await db.auditIssue.findUnique({ where: { id: issueId } });
      if (!existing) throw new McpToolError(`No finding with id "${issueId}".`);

      await db.auditIssue.update({ where: { id: issueId }, data: { resolved } });
      return result({
        summary: `"${existing.title}" marked ${resolved ? 'resolved' : 'open'}.`,
        data: { id: issueId, title: existing.title, resolved },
      });
    }),
  );

  // ------------------------------------------------------------- links

  server.registerTool(
    'get_links',
    {
      title: 'Links',
      description:
        'Links found during the crawl and the status each resolved to. Verdicts are ok, broken, blocked, unreachable or unchecked.',
      inputSchema: z.object({
        site: siteArg,
        verdict: z
          .enum(['ok', 'broken', 'blocked', 'unreachable', 'unchecked', 'all'])
          .default('all')
          .describe('Filter by verdict. "blocked" and "unreachable" are not broken links.'),
        internal: z.boolean().optional().describe('Restrict to internal (true) or external (false) links.'),
        limit: z.number().int().min(1).max(500).default(100),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(async ({ site: ref, verdict, internal, limit }) => {
      const site = await resolveSite(ref);
      const where = {
        siteId: site.id,
        ...(verdict === 'all' ? {} : { verdict }),
        ...(internal === undefined ? {} : { isInternal: internal }),
      };

      const [rows, total, counts] = await Promise.all([
        db.link.findMany({ where, orderBy: { checkedAt: 'desc' }, take: limit }),
        db.link.count({ where }),
        db.link.groupBy({ by: ['verdict'], where: { siteId: site.id }, _count: true }),
      ]);

      if (!total) throw new McpToolError(`No links on ${site.domain} match that filter.`);

      const tally = Object.fromEntries(counts.map((c) => [c.verdict, c._count]));

      return result({
        summary:
          `${num(total)} links on ${site.domain}${verdict === 'all' ? '' : ` with verdict "${verdict}"`}, showing ${num(rows.length)}. ` +
          `Across the whole site: ${Object.entries(tally).map(([k, v]) => `${num(v as number)} ${k}`).join(', ')}.`,
        data: {
          site: { domain: site.domain },
          total,
          shown: rows.length,
          tally,
          links: rows.map((l) => ({
            fromUrl: l.fromUrl,
            toUrl: l.toUrl,
            anchorText: l.anchorText,
            isInternal: l.isInternal,
            statusCode: l.statusCode,
            verdict: l.verdict,
            redirectTo: l.redirectTo,
            error: l.error,
          })),
        },
      });
    }),
  );

  server.registerTool(
    'get_broken_links',
    {
      title: 'Broken links',
      description:
        'Links that returned 404, 410 or a server error, grouped by target so one dead link across many pages reads as one problem. Excludes 401/403/429 and timeouts, which are reported separately as unverified.',
      inputSchema: z.object({ site: siteArg }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(async ({ site: ref }) => {
      const site = await resolveSite(ref);

      const [broken, unverified] = await Promise.all([
        db.link.findMany({ where: { siteId: site.id, verdict: 'broken' }, orderBy: { toUrl: 'asc' } }),
        db.link.count({ where: { siteId: site.id, verdict: { in: ['blocked', 'unreachable'] } } }),
      ]);

      if (!broken.length) {
        return result({
          summary:
            `No broken links on ${site.domain}.` +
            (unverified ? ` ${num(unverified)} links could not be verified (bot protection or a timeout) — those are not broken.` : ''),
          data: { site: { domain: site.domain }, total: 0, unverified, targets: [] },
        });
      }

      // Group by target: the unit of work is the dead URL, not each place it
      // is linked from.
      const grouped = new Map<string, { toUrl: string; statusCode: number | null; sources: string[] }>();
      for (const l of broken) {
        const g = grouped.get(l.toUrl) ?? { toUrl: l.toUrl, statusCode: l.statusCode, sources: [] };
        g.sources.push(l.fromUrl);
        grouped.set(l.toUrl, g);
      }
      const targets = [...grouped.values()].sort((a, b) => b.sources.length - a.sources.length);

      return result({
        summary:
          `${num(targets.length)} broken target${targets.length === 1 ? '' : 's'} on ${site.domain}, linked from ${num(broken.length)} place${broken.length === 1 ? '' : 's'}:\n` +
          targets
            .slice(0, 10)
            .map((t) => `- ${t.toUrl} (${t.statusCode ?? 'error'}) — linked from ${num(t.sources.length)} page${t.sources.length === 1 ? '' : 's'}`)
            .join('\n') +
          (targets.length > 10 ? `\n…and ${num(targets.length - 10)} more.` : '') +
          (unverified ? `\n${num(unverified)} further links could not be verified (bot protection or timeout) and are not counted as broken.` : ''),
        data: {
          site: { domain: site.domain },
          total: targets.length,
          linkInstances: broken.length,
          unverified,
          targets: targets.map((t) => ({
            toUrl: t.toUrl,
            statusCode: t.statusCode,
            linkedFrom: t.sources.length,
            sources: t.sources.slice(0, 20),
          })),
        },
      });
    }),
  );
}
