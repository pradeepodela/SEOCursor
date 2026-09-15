export const ISSUES = [
  { title: 'Missing canonical tag', category: 'Technical', severity: 'CRITICAL', affectedUrl: '/crm/pricing', whyItMatters: 'Google may treat /crm/pricing and /pricing as separate pages competing for the same query, splitting link equity between them.', recommendedAction: 'Set the canonical URL on /crm/pricing to https://example.com/pricing.', aiFixable: true, beforeText: '<head>\n  <title>CRM Pricing | Example</title>\n  <!-- no canonical -->\n</head>', afterText: '<head>\n  <title>CRM Pricing | Example</title>\n  <link rel="canonical" href="https://example.com/pricing" />\n</head>' },
  { title: 'Duplicate title tags across 4 pages', category: 'Metadata', severity: 'CRITICAL', affectedUrl: '/crm/pricing', whyItMatters: 'Four pages share near-identical titles, so Google has no signal for which one to rank and may pick the weakest.', recommendedAction: 'Write a distinct, intent-matched title for each page in the pricing cluster.', aiFixable: true, beforeText: 'CRM Pricing | Example', afterText: 'CRM Pricing — Plans from $12/user/month | Example' },
  { title: 'Meta description missing', category: 'Metadata', severity: 'CRITICAL', affectedUrl: '/crm/pricing', whyItMatters: 'Google will generate a snippet from body copy, which usually reduces click-through rate against competitors with written descriptions.', recommendedAction: 'Add a 150-character description highlighting the free tier and per-user price.', aiFixable: true, beforeText: '(none)', afterText: 'Compare Example CRM plans. Start free for up to 3 users, then $12/user/month. No setup fees, cancel anytime.' },
  { title: 'Thin content on 3 integration pages', category: 'Content', severity: 'WARNING', affectedUrl: '/integrations/slack', whyItMatters: 'At 290–310 words these pages sit far below the 900-word SERP average and are unlikely to rank for their target queries.', recommendedAction: 'Expand each integration page with setup steps, a use-case section and a screenshot.', aiFixable: true },
  { title: '12 pages have no inbound internal links', category: 'Internal Linking', severity: 'WARNING', affectedUrl: '/blog/lead-scoring-guide', whyItMatters: 'Orphaned and weakly-linked pages receive very little crawl priority and almost no internal authority.', recommendedAction: 'Add contextual links from the 6 highest-authority related pages.', aiFixable: true },
  { title: 'Images missing alt text', category: 'Images', severity: 'WARNING', affectedUrl: '/features/pipeline', whyItMatters: '28 images across the site have no alt attribute, losing image-search visibility and failing accessibility checks.', recommendedAction: 'Generate descriptive alt text for all 28 images.', aiFixable: true },
  { title: 'Largest Contentful Paint above 2.5s on mobile', category: 'Performance', severity: 'WARNING', affectedUrl: '/', whyItMatters: 'LCP of 3.1s on mobile fails Core Web Vitals, which is a confirmed ranking signal and hurts conversion.', recommendedAction: 'Preload the hero image and defer the analytics bundle.', aiFixable: false },
  { title: 'No Article schema on 6 blog posts', category: 'Schema', severity: 'WARNING', affectedUrl: '/blog/crm-implementation-checklist', whyItMatters: 'Missing structured data removes eligibility for rich results and article carousels.', recommendedAction: 'Add Article JSON-LD with author, datePublished and dateModified.', aiFixable: true },
  { title: 'H1 duplicated with page title on 9 pages', category: 'On-page', severity: 'WARNING', affectedUrl: '/features/automation', whyItMatters: 'Identical H1 and title wastes a distinct relevance signal you could use for a secondary term.', recommendedAction: 'Differentiate H1s to cover a supporting keyword variation.', aiFixable: true },
  { title: 'Sitemap contains 14 noindexed URLs', category: 'Indexing', severity: 'WARNING', affectedUrl: '/sitemap.xml', whyItMatters: 'Submitting noindexed URLs wastes crawl budget and produces coverage errors in Search Console.', recommendedAction: 'Regenerate the sitemap excluding noindexed and redirected URLs.', aiFixable: true },
  { title: '3 internal links return 301 redirects', category: 'Technical', severity: 'WARNING', affectedUrl: '/customers', whyItMatters: 'Redirect chains slow crawling and dilute the authority passed through each link.', recommendedAction: 'Update the 3 links to point at their final destination URLs.', aiFixable: true },
  { title: 'Open Graph image missing on 22 pages', category: 'Metadata', severity: 'WARNING', affectedUrl: '/blog/lead-scoring-guide', whyItMatters: 'Social shares render without a preview image, reducing referral click-through.', recommendedAction: 'Add a default OG image and per-post overrides for the top 10 posts.', aiFixable: true },
];

export const PASSED_CHECKS = 116;

export const OPPORTUNITIES = [
  {
    rank: 1, title: 'Create a page for "Best CRM for small businesses"', subject: 'best crm for small businesses',
    type: 'NEW_CONTENT', impact: 'HIGH', effort: 'MEDIUM', searchVolume: 5400, difficulty: 63, impressions: 8200,
    competition: 'Medium', currentCoverage: 'None', quickWin: false, actionLabel: 'Generate Brief',
    recommendedAction: 'Create a dedicated comparison landing page at /best-crm-small-business with a feature matrix and 10 alternatives.',
    reasoning: [
      { source: 'Keyword data', finding: '"best crm for small businesses" — 5,400 searches/month, difficulty 63.' },
      { source: 'Search Console', finding: 'You already surface 8,200 impressions for this cluster with no dedicated page.' },
      { source: 'Crawler', finding: 'No page on example.com targets this intent. /crm partially absorbs it.' },
      { source: 'Competitors', finding: 'PipelineHQ, Closerly and SalesNest all rank top-10 with dedicated pages.' },
    ],
    conclusion: 'CREATE PAGE — demand is proven, coverage is zero, and every tracked competitor has already claimed it.',
  },
  {
    rank: 2, title: 'Improve title and content for /crm', subject: '/crm',
    type: 'UPDATE_PAGE', impact: 'HIGH', effort: 'LOW', searchVolume: 40500, difficulty: 84, impressions: 18400,
    competition: 'High', currentCoverage: 'Medium', quickWin: true, actionLabel: 'View Suggestion',
    recommendedAction: 'Rewrite the title for intent match, expand the integrations section and split the small-business intent onto its own page.',
    reasoning: [
      { source: 'Search Console', finding: '18,400 impressions but average position 12.8 — traffic is being left on the table.' },
      { source: 'Crawler', finding: 'Page is 1,120 words against a 2,300-word SERP average, and has not been updated in 40 days.' },
      { source: 'Keyword data', finding: 'The page competes for two distinct intents: "crm software" and "small business crm software".' },
      { source: 'Competitors', finding: 'Top three results all lead with a specific audience in the title tag.' },
    ],
    conclusion: 'UPDATE PAGE — the impressions already exist; this is the fastest available gain on the site.',
  },
  {
    rank: 3, title: 'Create a blog on "CRM vs Spreadsheet"', subject: 'crm vs spreadsheet',
    type: 'NEW_CONTENT', impact: 'HIGH', effort: 'LOW', searchVolume: 3200, difficulty: 34, impressions: 2100,
    competition: 'Low', currentCoverage: 'None', quickWin: true, actionLabel: 'Generate Brief',
    recommendedAction: 'Publish a 1,600-word comparison article with a decision table and a migration CTA.',
    reasoning: [
      { source: 'Keyword data', finding: '3,200 searches/month at difficulty 34 — well within reach at DR 32.' },
      { source: 'Crawler', finding: 'No existing content addresses the spreadsheet-to-CRM transition.' },
      { source: 'Competitors', finding: 'Only one tracked competitor covers this, with a 700-word post from 2023.' },
    ],
    conclusion: 'CREATE CONTENT — low difficulty, clear gap, and it feeds directly into your free-trial funnel.',
  },
  {
    rank: 4, title: 'Add internal links to 12 related pages', subject: 'internal linking',
    type: 'INTERNAL_LINKING', impact: 'MEDIUM', effort: 'LOW', searchVolume: null, difficulty: null, impressions: null,
    competition: 'Low', currentCoverage: 'Low', quickWin: true, actionLabel: 'View Details',
    recommendedAction: 'Add 34 contextual internal links from high-authority pages to 12 under-linked pages.',
    reasoning: [
      { source: 'Crawler', finding: '12 pages receive fewer than 5 internal links each, including 3 that rank on page 2.' },
      { source: 'Search Console', finding: 'Those 12 pages collectively hold 19,400 impressions.' },
    ],
    conclusion: 'BUILD LINKS — no new content required, and it lifts pages that already have demand.',
  },
  {
    rank: 5, title: 'Fix 3 critical technical SEO issues', subject: 'technical',
    type: 'TECHNICAL', impact: 'MEDIUM', effort: 'LOW', searchVolume: null, difficulty: null, impressions: null,
    competition: null, currentCoverage: null, quickWin: true, actionLabel: 'View Issues',
    recommendedAction: 'Resolve the missing canonical, duplicate titles and missing meta description in the pricing cluster.',
    reasoning: [
      { source: 'Crawler', finding: '3 critical issues all concentrated in the /pricing cluster.' },
      { source: 'Search Console', finding: '/pricing is your highest-converting organic entry point, so the risk is disproportionate.' },
    ],
    conclusion: 'FIX NOW — small effort protecting your best commercial page.',
  },
  {
    rank: 6, title: 'Build a "CRM implementation" content cluster', subject: 'crm implementation',
    type: 'NEW_CONTENT', impact: 'HIGH', effort: 'HIGH', searchVolume: 4800, difficulty: 49, impressions: 9800,
    competition: 'High', currentCoverage: 'Low', quickWin: false, actionLabel: 'Generate Brief',
    recommendedAction: 'Build a pillar page plus five spokes covering migration, onboarding, data import, training and rollout.',
    reasoning: [
      { source: 'Competitors', finding: 'PipelineHQ has 34 articles on implementation; you have 1 at 890 words.' },
      { source: 'Search Console', finding: '9,800 impressions already arriving at a single under-built post.' },
      { source: 'Keyword data', finding: 'Cluster totals 11,300 monthly searches across 14 keywords at difficulty 26–49.' },
    ],
    conclusion: 'BUILD CLUSTER — the highest-ceiling opportunity on the site, though it needs six pieces to work.',
  },
  {
    rank: 7, title: 'Launch "CRM for [industry]" vertical pages', subject: 'crm for real estate',
    type: 'NEW_CONTENT', impact: 'MEDIUM', effort: 'MEDIUM', searchVolume: 6600, difficulty: 55, impressions: 900,
    competition: 'Medium', currentCoverage: 'None', quickWin: false, actionLabel: 'Generate Brief',
    recommendedAction: 'Template a vertical page pattern and launch with real estate, consultants and agencies.',
    reasoning: [
      { source: 'Competitors', finding: 'Closerly ranks top-3 for 41 vertical variations from one page template.' },
      { source: 'Keyword data', finding: 'Real estate, consultants and agencies total 10,900 monthly searches.' },
      { source: 'Crawler', finding: 'No vertical pages exist on your site.' },
    ],
    conclusion: 'CREATE PAGES — proven template pattern, but only worth it if each page gets genuine vertical-specific content.',
  },
  {
    rank: 8, title: 'Expand thin integration pages', subject: '/features/integrations',
    type: 'UPDATE_PAGE', impact: 'MEDIUM', effort: 'LOW', searchVolume: 1900, difficulty: 38, impressions: 11200,
    competition: 'Low', currentCoverage: 'Low', quickWin: true, actionLabel: 'View Suggestion',
    recommendedAction: 'Expand the hub and the Slack and Gmail pages from ~300 to ~900 words with setup steps and screenshots.',
    reasoning: [
      { source: 'Crawler', finding: 'Three pages average 343 words against a 900-word SERP average.' },
      { source: 'Search Console', finding: '11,200 combined impressions at positions 16–20.' },
    ],
    conclusion: 'UPDATE PAGES — thin content is the only thing keeping these off page one.',
  },
];

export const CLUSTERS = [
  { pillar: 'CRM', priority: 1, covered: 2, total: 6, children: ['CRM for startups', 'CRM for small businesses', 'CRM implementation', 'CRM migration', 'CRM onboarding', 'What is a CRM'] },
  { pillar: 'Sales', priority: 2, covered: 3, total: 5, children: ['Sales pipeline stages', 'Lead management', 'Sales automation', 'Sales follow-up emails', 'Lead scoring'] },
  { pillar: 'Comparisons', priority: 3, covered: 0, total: 4, children: ['CRM vs spreadsheet', 'CRM alternatives', 'Example vs PipelineHQ', 'Best CRM tools compared'] },
  { pillar: 'Verticals', priority: 4, covered: 0, total: 4, children: ['CRM for real estate', 'CRM for consultants', 'CRM for agencies', 'CRM for nonprofits'] },
  { pillar: 'Integrations', priority: 5, covered: 3, total: 5, children: ['Gmail CRM', 'Slack CRM integration', 'Zapier', 'Outlook', 'HubSpot import'] },
];

export const STRATEGY = {
  headline: 'Win the mid-funnel before competing for the head term.',
  currentPosition: [
    'Strong technical foundation — 82/100, with only 3 critical issues, all in one cluster.',
    'Weak topic coverage — 128 pages but only 2 of 6 CRM subtopics have dedicated content.',
    'Low authority compared with competitors — DR 32 against 68, 54 and 41.',
    'Proven demand already arriving — 47K monthly impressions on pages ranking outside the top 10.',
  ],
  growthAreas: [
    { name: 'CRM', rationale: 'Your category term. 11.3K monthly searches sit in subtopics you have not covered.' },
    { name: 'Sales automation', rationale: 'Adjacent and credible. One page ranks 14.6 already with minimal support.' },
    { name: 'Lead management', rationale: 'Zero coverage, 5.9K searches, and it maps to a feature you already ship.' },
    { name: 'CRM integrations', rationale: '11.2K impressions trapped behind thin pages. Cheapest ceiling on the site.' },
  ],
  summary: 'At DR 32 you will not win "crm software" this year, and chasing it wastes the quarter. The realistic path is to take the mid-funnel: build the implementation and comparison clusters where difficulty sits between 26 and 49, convert the 47K impressions already landing on page-2 rankings, and let the internal links from those clusters lift /crm over the following two quarters. Technical work is nearly done — treat it as maintenance, not a project.',
};

export const BACKLINKS = [
  { sourceDomain: 'techcrunch.com', sourceUrl: 'https://techcrunch.com/2026/03/crm-tools-for-startups', targetUrl: '/', anchorText: 'Example CRM', domainRating: 93, dofollow: true },
  { sourceDomain: 'producthunt.com', sourceUrl: 'https://producthunt.com/posts/example-crm', targetUrl: '/', anchorText: 'Example CRM', domainRating: 91, dofollow: true },
  { sourceDomain: 'saashub.com', sourceUrl: 'https://saashub.com/example-crm', targetUrl: '/', anchorText: 'example.com', domainRating: 72, dofollow: true },
  { sourceDomain: 'indiehackers.com', sourceUrl: 'https://indiehackers.com/post/crm-stack', targetUrl: '/pricing', anchorText: 'affordable CRM', domainRating: 78, dofollow: true },
  { sourceDomain: 'zapier.com', sourceUrl: 'https://zapier.com/apps/example-crm', targetUrl: '/features/integrations', anchorText: 'Example CRM integration', domainRating: 92, dofollow: false },
  { sourceDomain: 'g2.com', sourceUrl: 'https://g2.com/products/example-crm', targetUrl: '/', anchorText: 'Example CRM reviews', domainRating: 89, dofollow: false },
  { sourceDomain: 'smallbiztrends.com', sourceUrl: 'https://smallbiztrends.com/best-crm-2026', targetUrl: '/crm', anchorText: 'best CRM for small teams', domainRating: 74, dofollow: true },
  { sourceDomain: 'nocodefounders.com', sourceUrl: 'https://nocodefounders.com/tools/crm', targetUrl: '/', anchorText: 'Example', domainRating: 51, dofollow: true },
  { sourceDomain: 'salesstack.io', sourceUrl: 'https://salesstack.io/crm-comparison', targetUrl: '/blog/what-is-a-crm', anchorText: 'what a CRM does', domainRating: 46, dofollow: true },
  { sourceDomain: 'betalist.com', sourceUrl: 'https://betalist.com/startups/example-crm', targetUrl: '/', anchorText: 'Example CRM', domainRating: 68, dofollow: true },
  { sourceDomain: 'medium.com', sourceUrl: 'https://medium.com/@sarah/crm-that-doesnt-suck', targetUrl: '/blog/crm-best-practices', anchorText: 'CRM best practices', domainRating: 95, dofollow: false },
  { sourceDomain: 'reddit.com', sourceUrl: 'https://reddit.com/r/sales/comments/crm-recs', targetUrl: '/pricing', anchorText: 'example.com/pricing', domainRating: 96, dofollow: false },
];

export const RECOMMENDATIONS = {
  '/crm': [
    { order: 1, title: 'Rewrite the title tag for intent match', impact: 'HIGH', detail: 'The current title is generic and does not name the audience. Top-ranking pages all lead with a specific buyer.', beforeText: 'CRM Software | Example', afterText: 'CRM Software for Small Sales Teams — Free 14-Day Trial | Example' },
    { order: 2, title: 'Expand the integrations section', impact: 'HIGH', detail: 'Integrations are mentioned in a single sentence. Buyers at this stage filter on tooling compatibility, and the SERP average devotes ~400 words to it.', beforeText: 'Example CRM connects with the tools you use.', afterText: 'Example CRM connects with 60+ tools including Gmail, Outlook, Slack, Zapier and QuickBooks.\n\nEmail — two-way sync logs every message to the right deal automatically.\nCalendar — meetings booked from a deal record write back to Google Calendar.\nAutomation — trigger Zapier workflows on any stage change.\n\n[See all 60+ integrations →]' },
    { order: 3, title: 'Add internal links to 6 related pages', impact: 'MEDIUM', detail: 'This page has 8 internal links out but sits at the centre of your CRM cluster. Linking to the pillar spokes distributes authority and helps Google map the topic.' },
    { order: 4, title: 'Add an FAQ section with schema', impact: 'MEDIUM', detail: 'Six "People also ask" questions appear for your target query and none are answered on the page. FAQPage markup also makes the result eligible for expanded SERP real estate.' },
    { order: 5, title: 'Split the small-business intent onto its own page', impact: 'HIGH', detail: 'This page ranks 12.8 for "crm software" and 24.6 for "small business crm software" — two intents fighting for one URL. Moving the second to /best-crm-small-business should lift both.' },
  ],
  '/features/integrations': [
    { order: 1, title: 'Expand from 430 to ~900 words', impact: 'HIGH', detail: 'The page is less than half the length of every result ranking above it. Add a per-category breakdown and setup steps.' },
    { order: 2, title: 'Add SoftwareApplication schema', impact: 'MEDIUM', detail: 'No structured data exists on this page, removing eligibility for rich results.' },
    { order: 3, title: 'Link to each individual integration page', impact: 'MEDIUM', detail: 'The hub links to only 5 of your 12 integration pages, leaving the rest nearly orphaned.' },
  ],
};
