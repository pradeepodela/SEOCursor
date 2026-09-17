/**
 * The MCP Apps catalogue.
 *
 * One entry per interactive view. Tools reference these URIs through
 * `_meta.ui.resourceUri`, and the server registers a resource for each, so a
 * typo cannot point a tool at a view that does not exist — both sides read
 * this file.
 *
 * Not every tool gets a view. A UI earns its place when the answer is a table
 * to scan, sort and act on; for everything else the text result is better,
 * and a view would just be a worse way to read a sentence.
 */

/** Stable `ui://` identifiers. These are part of the published contract. */
export const UI = {
  audit: 'ui://seo-cursor/audit.html',
  pages: 'ui://seo-cursor/pages.html',
  rankings: 'ui://seo-cursor/rankings.html',
  ideas: 'ui://seo-cursor/ideas.html',
} as const;

export type AppKey = keyof typeof UI;

export type AppDefinition = {
  key: AppKey;
  uri: string;
  /** Human-readable name shown in `resources/list`. */
  name: string;
  description: string;
  /** Entry source, relative to this directory. Built to `dist/<key>.html`. */
  entry: string;
};

export const APPS: AppDefinition[] = [
  {
    key: 'audit',
    uri: UI.audit,
    name: 'Audit findings',
    description: 'Findings by severity and category, with the URLs each affects and a one-click resolve.',
    entry: 'src/audit.tsx',
  },
  {
    key: 'pages',
    uri: UI.pages,
    name: 'Crawled pages',
    description: 'Sortable table of every crawled page with status, depth, words and search performance.',
    entry: 'src/pages.tsx',
  },
  {
    key: 'rankings',
    uri: UI.rankings,
    name: 'Search rankings',
    description: 'Queries from Search Console, with the page-two near-misses called out.',
    entry: 'src/rankings.tsx',
  },
  {
    key: 'ideas',
    uri: UI.ideas,
    name: 'Blog ideas',
    description: 'Blog ideas with the evidence behind each, and a button to write or dismiss one.',
    entry: 'src/ideas.tsx',
  },
];
