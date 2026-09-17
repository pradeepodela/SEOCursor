/**
 * The MCP server.
 *
 * One factory, both transports. `createMcpHandler` calls it once per HTTP
 * request and `serveStdio` once per connection, so nothing here may hold
 * per-connection state — the database client is the only thing shared, and it
 * is already a process-wide singleton.
 *
 * The workspace UI and this server are two clients of the same library code.
 * Neither goes through the other.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/server';
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { db } from '../lib/db';
import { APPS } from './apps/registry';
import { registerCrawlTools } from './tools/crawl';
import { registerAuditTools } from './tools/audit';
import { registerSearchTools } from './tools/search';
import { registerContentTools } from './tools/content';
import { registerKeywordTools } from './tools/keywords';

export const SERVER_INFO = {
  name: 'seo-cursor',
  title: 'SEO Cursor',
  version: '0.1.0',
} as const;

const INSTRUCTIONS = `An SEO workspace for a website you have crawled.

Everything these tools return was measured: the crawler reports what it found on the site, Search Console reports what Google recorded. Nothing is estimated. Where a number is a lower bound rather than a fact — inbound-link counts on a crawl that hit its page cap, most importantly — the tool says so, and you should not read a low count as an orphan page.

Start with \`get_site\` for the state of a website, then \`audit_site\` for what is wrong and \`get_rankings\` for what it earns. Nothing works until the site has been crawled at least once.

Three tools cost money or reach the public: \`generate_ideas\` and \`generate_blog\` spend LLM credits, \`research_keywords\` and \`enrich_keywords\` are billed per call, and \`publish_blog\` puts a post on a live website and takes an explicit confirm. Check with the user before calling those.

Backlink authority is deliberately absent. A crawl cannot observe who links to a site from outside, and a number invented to fill that gap would be the only one here that is not measured.`;

/**
 * Where the built app views live.
 *
 * Resolved by walking up to the project root rather than trusting the working
 * directory: a host like Claude Desktop spawns the stdio binary from wherever
 * it happens to be, and Astro's SSR build relocates this module into
 * `dist/server/`. Walking to the nearest `package.json` is right in both.
 */
function projectRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const VIEWS = resolve(projectRoot(), 'src/mcp/apps/dist');

/** Views are read once per process and reused across connections. */
const viewCache = new Map<string, string>();

async function loadView(key: string): Promise<string> {
  const cached = viewCache.get(key);
  if (cached) return cached;

  const file = resolve(VIEWS, `${key}.html`);
  if (!existsSync(file)) {
    throw new Error(
      `The "${key}" view has not been built. Run \`npm run build:mcp\` — the views are bundled to self-contained HTML because an app iframe has no origin to load assets from.`,
    );
  }
  const html = await readFile(file, 'utf8');
  viewCache.set(key, html);
  return html;
}

/**
 * Build a server instance.
 *
 * Tools are registered unconditionally rather than gated on the client
 * advertising MCP Apps support: every tool returns a complete text result as
 * well as its structured data, so a client with no UI support gets a usable
 * answer from the same call and the tool list does not change shape depending
 * on who is asking.
 */
export function createSeoServer(): McpServer {
  const server = new McpServer(SERVER_INFO, {
    instructions: INSTRUCTIONS,
    capabilities: { tools: {}, resources: {} },
  });

  registerCrawlTools(server);
  registerAuditTools(server);
  registerSearchTools(server);
  registerContentTools(server);
  registerKeywordTools(server);

  registerViews(server);
  registerDataResources(server);

  return server;
}

/** Register one `ui://` resource per app view. */
function registerViews(server: McpServer): void {
  for (const app of APPS) {
    registerAppResource(
      server,
      app.name,
      app.uri,
      {
        description: app.description,
        _meta: {
          ui: {
            // The views are fully self-contained: no network access of any
            // kind. Declaring nothing here keeps the host's default
            // `default-src 'none'` in force, which is exactly what we want —
            // a view that cannot phone home cannot leak a client's data.
            csp: {},
            prefersBorder: true,
          },
        },
      },
      async () => ({
        contents: [
          {
            uri: app.uri,
            mimeType: RESOURCE_MIME_TYPE,
            text: await loadView(app.key),
          },
        ],
      }),
    );
  }
}

/**
 * Read-only data resources.
 *
 * These mirror what the tools return, for clients that browse resources rather
 * than call tools. They resolve against the primary site, since a resource URI
 * carries no arguments.
 */
function registerDataResources(server: McpServer): void {
  const json = (uri: string, data: unknown) => ({
    contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }],
  });

  const primary = async () => {
    const site = await db.site.findFirst({ orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] });
    if (!site) throw new Error('No website is connected yet.');
    return site;
  };

  server.registerResource(
    'Website',
    'seo://site',
    { description: 'The connected website, its crawl summary and health scores.', mimeType: 'application/json' },
    async (uri) => {
      const site = await primary();
      return json(uri.href, {
        domain: site.domain,
        url: site.url,
        healthScore: site.healthScore,
        scores: {
          technical: site.technicalScore,
          onPage: site.onPageScore,
          content: site.contentScore,
          ux: site.uxScore,
        },
        indexedPages: site.indexedPages,
        issueCount: site.issueCount,
        lastCrawlAt: site.lastCrawlAt,
        renderMode: site.renderMode,
      });
    },
  );

  server.registerResource(
    'Pages',
    'seo://pages',
    { description: 'Every crawled page with on-page elements and search performance.', mimeType: 'application/json' },
    async (uri) => {
      const site = await primary();
      const pages = await db.page.findMany({
        where: { siteId: site.id, crawledAt: { not: null } },
        orderBy: [{ depth: 'asc' }],
        take: 500,
      });
      return json(uri.href, pages.map((p) => ({
        url: p.url,
        title: p.title,
        metaDesc: p.metaDesc,
        h1: p.h1,
        statusCode: p.statusCode,
        depth: p.depth,
        wordCount: p.wordCount,
        inboundLinks: p.inboundLinks,
        indexable: p.indexable,
        impressions: p.impressions,
        clicks: p.clicks,
        position: p.position,
      })));
    },
  );

  server.registerResource(
    'Findings',
    'seo://findings',
    { description: 'Open audit findings with the URLs each one affects.', mimeType: 'application/json' },
    async (uri) => {
      const site = await primary();
      const issues = await db.auditIssue.findMany({
        where: { siteId: site.id, resolved: false },
        orderBy: [{ severity: 'asc' }, { affectedCount: 'desc' }],
      });
      return json(uri.href, issues.map((i) => ({
        code: i.code,
        title: i.title,
        category: i.category,
        severity: i.severity,
        affectedCount: i.affectedCount,
        samples: i.samples,
        whyItMatters: i.whyItMatters,
        recommendedAction: i.recommendedAction,
      })));
    },
  );

  server.registerResource(
    'Links',
    'seo://links',
    { description: 'Every link found and the status it resolved to.', mimeType: 'application/json' },
    async (uri) => {
      const site = await primary();
      const links = await db.link.findMany({ where: { siteId: site.id }, take: 2000 });
      return json(uri.href, links.map((l) => ({
        fromUrl: l.fromUrl,
        toUrl: l.toUrl,
        anchorText: l.anchorText,
        isInternal: l.isInternal,
        statusCode: l.statusCode,
        verdict: l.verdict,
      })));
    },
  );

  server.registerResource(
    'Rankings',
    'seo://rankings',
    { description: 'Search Console queries, impressions, clicks and positions.', mimeType: 'application/json' },
    async (uri) => {
      const site = await primary();
      const keywords = await db.keyword.findMany({
        where: { siteId: site.id },
        orderBy: [{ impressions: 'desc' }],
        take: 1000,
      });
      return json(uri.href, keywords.map((k) => ({
        keyword: k.keyword,
        position: k.position,
        impressions: k.impressions,
        clicks: k.clicks,
        volume: k.volume || null,
        difficulty: k.difficulty || null,
        intent: k.intent,
        opportunity: k.opportunity,
        source: k.source,
      })));
    },
  );
}
