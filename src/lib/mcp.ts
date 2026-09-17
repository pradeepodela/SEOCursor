/**
 * MCP surface definition.
 *
 * The workspace UI is one client of this contract; Claude, Cursor or any other
 * agent is another. Keeping the definition in one place means the page that
 * documents the server and the endpoint that serves the manifest cannot drift.
 *
 * It cannot drift from the server either: `npm run mcp-check` asserts that
 * this catalogue and the tools the server actually registers are the same set,
 * so a tool added in `src/mcp/tools` without a line here fails the check rather
 * than quietly going undocumented.
 */

export type McpTool = {
  name: string;
  group: string;
  description: string;
  input: Record<string, string>;
  readOnly: boolean;
  /** Renders an interactive MCP App view in hosts that support them. */
  app?: boolean;
  /** Spends money or reaches the public, and should be confirmed with a person. */
  costly?: boolean;
};

export const MCP_TOOLS: McpTool[] = [
  // --- crawl ---
  { name: 'connect_site', group: 'Crawl', description: 'Register a new website and start its first crawl. Verifies the site responds before storing anything.', input: { url: 'string', maxPages: 'number?' }, readOnly: false },
  { name: 'crawl_site', group: 'Crawl', description: 'Re-crawl a connected website and refresh its pages, links and findings.', input: { site: 'string?', maxPages: 'number?' }, readOnly: false },
  { name: 'get_crawl_status', group: 'Crawl', description: 'Progress of a running crawl, or the summary of a finished one.', input: { crawlId: 'string?', site: 'string?' }, readOnly: true },
  { name: 'get_site', group: 'Crawl', description: 'Crawl summary and health scores: page count, findings, score breakdown and what is connected.', input: { site: 'string?' }, readOnly: true },
  { name: 'get_pages', group: 'Crawl', description: 'Every crawled page with status, depth, word count, inbound links and search performance.', input: { site: 'string?', q: 'string?', limit: 'number?' }, readOnly: true, app: true },
  { name: 'get_page', group: 'Crawl', description: 'Full detail for one URL: on-page elements, headings, schema, social tags, performance.', input: { url: 'string', site: 'string?' }, readOnly: true },
  { name: 'list_sites', group: 'Crawl', description: 'Every website connected to this workspace.', input: {}, readOnly: true },

  // --- audit ---
  { name: 'audit_site', group: 'Audit', description: 'Open findings by severity and category, each with why it matters and the URLs it affects.', input: { site: 'string?', severity: 'string?', category: 'string?' }, readOnly: true, app: true },
  { name: 'resolve_issue', group: 'Audit', description: 'Mark a finding resolved once it has been fixed outside a crawl.', input: { issueId: 'string', resolved: 'boolean?' }, readOnly: false },
  { name: 'get_links', group: 'Audit', description: 'Every link found and the verdict it resolved to: ok, broken, blocked, unreachable or unchecked.', input: { site: 'string?', verdict: 'string?', internal: 'boolean?', limit: 'number?' }, readOnly: true },
  { name: 'get_broken_links', group: 'Audit', description: 'Links returning 404, 410 or 5xx, grouped by target. Excludes bot-protection responses and timeouts.', input: { site: 'string?' }, readOnly: true },

  // --- search data ---
  { name: 'get_rankings', group: 'Search data', description: 'Queries this site ranks for, with impressions, clicks and average position. Sorted by opportunity.', input: { site: 'string?', filter: 'string?', opportunity: 'string?', sort: 'string?', limit: 'number?' }, readOnly: true, app: true },
  { name: 'get_page_performance', group: 'Search data', description: 'Per-URL impressions, clicks and average position from Search Console.', input: { site: 'string?', url: 'string?', limit: 'number?' }, readOnly: true },
  { name: 'sync_search_console', group: 'Search data', description: 'Pull a fresh window of Search Console data and match it onto crawled URLs.', input: { site: 'string?', days: 'number?' }, readOnly: false },

  // --- keywords ---
  { name: 'get_keywords', group: 'Keywords', description: 'Stored keywords, with the source of each row stated so merged data is never mistaken for measured data.', input: { site: 'string?', q: 'string?', tracked: 'boolean?', minVolume: 'number?', limit: 'number?' }, readOnly: true },
  { name: 'research_keywords', group: 'Keywords', description: 'Pull fresh keyword data from the connected provider by site, ranked terms or seeds.', input: { site: 'string?', mode: 'site|ranked|seeds', seeds: 'string[]?', limit: 'number?' }, readOnly: false, costly: true },
  { name: 'enrich_keywords', group: 'Keywords', description: 'Grade stored Search Console queries with volume and difficulty.', input: { site: 'string?', limit: 'number?' }, readOnly: false, costly: true },

  // --- content ---
  { name: 'list_ideas', group: 'Content', description: 'Blog ideas, each with the rationale and the measured data point behind it.', input: { site: 'string?', status: 'string?', limit: 'number?' }, readOnly: true, app: true },
  { name: 'generate_ideas', group: 'Content', description: "Generate blog titles from the site's own crawl and Search Console data.", input: { site: 'string?', count: 'number?' }, readOnly: false, costly: true },
  { name: 'add_idea', group: 'Content', description: 'Add a blog title to the list by hand.', input: { site: 'string?', title: 'string', targetQuery: 'string?', angle: 'string?', rationale: 'string?' }, readOnly: false },
  { name: 'dismiss_idea', group: 'Content', description: 'Dismiss an idea so the generator stops re-suggesting it.', input: { ideaId: 'string' }, readOnly: false },
  { name: 'generate_blog', group: 'Content', description: 'Write the post for one idea: an outline grounded in the real page list, then the draft.', input: { ideaId: 'string', site: 'string?' }, readOnly: false, costly: true },
  { name: 'list_drafts', group: 'Content', description: 'Content pieces written for this website, drafted or published.', input: { site: 'string?', status: 'string?', limit: 'number?' }, readOnly: true },
  { name: 'get_draft', group: 'Content', description: 'The full body of one draft, as markdown.', input: { draftId: 'string' }, readOnly: true },

  // --- write ---
  { name: 'publish_blog', group: 'Write', description: 'Publish a draft to the connected WordPress site. Requires an explicit confirm.', input: { draftId: 'string', status: 'draft|publish|pending', confirm: 'true' }, readOnly: false, costly: true },
];

/** `ui://` views a host with MCP Apps support renders inline. */
export const MCP_APPS = [
  { uri: 'ui://seo-cursor/audit.html', tool: 'audit_site', description: 'Findings by severity and category, with a one-click resolve.' },
  { uri: 'ui://seo-cursor/pages.html', tool: 'get_pages', description: 'Sortable table of every crawled page.' },
  { uri: 'ui://seo-cursor/rankings.html', tool: 'get_rankings', description: 'Queries from Search Console, with page-two near-misses called out.' },
  { uri: 'ui://seo-cursor/ideas.html', tool: 'list_ideas', description: 'Blog ideas with their evidence, and a button to write or dismiss one.' },
];

export const MCP_RESOURCES = [
  { uri: 'seo://site', description: 'The connected website, its crawl summary and health scores.', live: true },
  { uri: 'seo://pages', description: 'Every crawled page with on-page elements and search performance.', live: true },
  { uri: 'seo://findings', description: 'Open audit findings with the URLs each one affects.', live: true },
  { uri: 'seo://links', description: 'Every link found and the status it resolved to.', live: true },
  { uri: 'seo://rankings', description: 'Search Console queries, impressions, clicks and positions.', live: true },
];

export const MCP_GROUPS = ['Crawl', 'Audit', 'Search data', 'Keywords', 'Content', 'Write'];
