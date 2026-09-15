/**
 * MCP surface definition.
 *
 * The workspace UI is one client of this contract; Claude, Cursor or any other
 * agent is another. Keeping the definition in one place means the page that
 * documents the server and the endpoint that serves the manifest cannot drift.
 */

export type McpTool = {
  name: string;
  group: string;
  description: string;
  input: Record<string, string>;
  readOnly: boolean;
  /** Whether the data behind this tool exists yet. */
  live: boolean;
};

export const MCP_TOOLS: McpTool[] = [
  // --- backed by the crawler today ---
  { name: 'crawl_site', group: 'Crawl', description: 'Crawl a connected website and refresh pages, links and findings.', input: { site: 'string (domain)', maxPages: 'number?' }, readOnly: false, live: true },
  { name: 'get_site', group: 'Crawl', description: 'Crawl summary and health scores for a connected website.', input: { site: 'string' }, readOnly: true, live: true },
  { name: 'get_pages', group: 'Crawl', description: 'Every crawled page with status, depth, word count and inbound links.', input: { site: 'string', q: 'string?', limit: 'number?' }, readOnly: true, live: true },
  { name: 'get_page', group: 'Crawl', description: 'Full detail for one URL: on-page elements, links, schema, performance.', input: { site: 'string', url: 'string' }, readOnly: true, live: true },
  { name: 'audit_site', group: 'Audit', description: 'Findings grouped by severity and category, each with the URLs it affects.', input: { site: 'string', severity: 'string?' }, readOnly: true, live: true },
  { name: 'get_links', group: 'Audit', description: 'Every link found, with the status it resolved to.', input: { site: 'string', verdict: 'string?' }, readOnly: true, live: true },
  { name: 'get_broken_links', group: 'Audit', description: 'Links that returned 404, 410 or a server error, grouped by target.', input: { site: 'string' }, readOnly: true, live: true },

  // --- backed by Search Console today ---
  { name: 'get_rankings', group: 'Search data', description: 'Queries this site ranks for, with impressions, clicks and average position.', input: { site: 'string', filter: 'string?' }, readOnly: true, live: true },
  { name: 'get_page_performance', group: 'Search data', description: 'Per-URL impressions, clicks and position from Search Console.', input: { site: 'string', url: 'string?' }, readOnly: true, live: true },
  { name: 'sync_search_console', group: 'Search data', description: 'Pull a fresh window of Search Console data into the workspace.', input: { site: 'string', days: 'number?' }, readOnly: false, live: true },

  // --- later steps ---
  { name: 'get_keyword_metrics', group: 'Search data', description: 'Search volume and difficulty. Needs a third-party keyword provider.', input: { keyword: 'string' }, readOnly: true, live: false },
  { name: 'analyze_competitors', group: 'Competitors', description: 'Compare a site against tracked competitors.', input: { site: 'string' }, readOnly: true, live: false },
  { name: 'find_content_gaps', group: 'Competitors', description: 'Topics competitors cover that this site does not.', input: { site: 'string' }, readOnly: true, live: false },
  { name: 'get_opportunities', group: 'Strategy', description: 'The prioritised backlog, each item carrying its reasoning chain.', input: { site: 'string' }, readOnly: true, live: false },
  { name: 'get_content_calendar', group: 'Strategy', description: 'Scheduled work with type, date and status.', input: { site: 'string' }, readOnly: true, live: false },
  { name: 'create_content_brief', group: 'Content', description: 'Build an SEO brief from an opportunity or a target keyword.', input: { site: 'string', keyword: 'string' }, readOnly: false, live: false },
  { name: 'generate_article', group: 'Content', description: 'Write a draft against an existing brief.', input: { site: 'string', briefId: 'string' }, readOnly: false, live: false },
  { name: 'update_page', group: 'Write', description: 'Apply an approved change to a page. Requires explicit confirmation.', input: { site: 'string', url: 'string', changes: 'object' }, readOnly: false, live: false },
  { name: 'publish_content', group: 'Write', description: 'Publish a draft to the live site. Requires explicit confirmation.', input: { site: 'string', contentId: 'string', confirm: 'true' }, readOnly: false, live: false },
];

export const MCP_RESOURCES = [
  { uri: 'seo://site', description: 'The connected website, its crawl summary and health scores.', live: true },
  { uri: 'seo://pages', description: 'Every crawled page with on-page elements and performance.', live: true },
  { uri: 'seo://findings', description: 'Audit findings with the URLs each one affects.', live: true },
  { uri: 'seo://links', description: 'Every link found and the status it resolved to.', live: true },
  { uri: 'seo://rankings', description: 'Search Console queries, impressions, clicks and positions.', live: true },
  { uri: 'seo://competitors', description: 'Tracked competitors and gap analysis.', live: false },
  { uri: 'seo://opportunities', description: 'The prioritised SEO backlog.', live: false },
  { uri: 'seo://calendar', description: 'Scheduled content and technical work.', live: false },
];

export const MCP_GROUPS = ['Crawl', 'Audit', 'Search data', 'Competitors', 'Strategy', 'Content', 'Write'];
