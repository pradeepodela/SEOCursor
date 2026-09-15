// Realistic mock dataset for the SEO Cursor prototype.
// Primary workspace: a mid-market CRM SaaS competing with three larger players.

export const YEAR = 2026;
export const MONTH = 8; // September (0-indexed)
const d = (day) => new Date(Date.UTC(YEAR, MONTH, day, 9, 0, 0));

export const PRIMARY = {
  domain: 'example.com',
  url: 'https://example.com',
  name: 'Example CRM',
  emoji: '🟦',
  isPrimary: true,
  healthScore: 78,
  technicalScore: 82,
  onPageScore: 76,
  contentScore: 71,
  backlinkScore: 69,
  uxScore: 85,
  organicTraffic: 12400,
  trafficDelta: 18,
  keywordCount: 842,
  keywordDelta: 27,
  indexedPages: 128,
  pagesDelta: 6,
  issueCount: 12,
  issueDelta: -40,
  backlinkCount: 1200,
  domainRating: 32,
};

export const SECONDARY = {
  domain: 'northwind.io',
  url: 'https://northwind.io',
  name: 'Northwind Invoicing',
  emoji: '🟣',
  isPrimary: false,
  healthScore: 64,
  technicalScore: 71,
  onPageScore: 60,
  contentScore: 58,
  backlinkScore: 52,
  uxScore: 79,
  organicTraffic: 3800,
  trafficDelta: 9,
  keywordCount: 214,
  keywordDelta: 12,
  indexedPages: 46,
  pagesDelta: 15,
  issueCount: 21,
  issueDelta: 8,
  backlinkCount: 340,
  domainRating: 18,
};

export const COMPETITORS = [
  {
    domain: 'pipelinehq.com', name: 'PipelineHQ', label: 'A', color: '#6366f1',
    organicTraffic: 28100, keywordCount: 2100, backlinkCount: 4800, domainRating: 68, contentCount: 412,
    insight: 'PipelineHQ has significantly more content around CRM implementation — 34 dedicated articles against your 2.',
    insightGap: 'You currently have no dedicated content cluster for implementation, migration or onboarding topics.',
  },
  {
    domain: 'closerly.com', name: 'Closerly', label: 'B', color: '#0ea5e9',
    organicTraffic: 18300, keywordCount: 1400, backlinkCount: 3100, domainRating: 54, contentCount: 268,
    insight: 'Closerly ranks top-3 for 41 "CRM for [industry]" variations using a single templated page structure.',
    insightGap: 'A programmatic vertical-page pattern would let you compete on the same long tail at low effort.',
  },
  {
    domain: 'salesnest.io', name: 'SalesNest', label: 'C', color: '#f59e0b',
    organicTraffic: 9600, keywordCount: 620, backlinkCount: 1900, domainRating: 41, contentCount: 134,
    insight: 'SalesNest is smaller than you on backlinks but outranks you on 18 comparison keywords.',
    insightGap: 'Their /alternatives and /vs pages are winning traffic you have no page for.',
  },
];

export const PAGES = [
  { url: '/', title: 'Example CRM — Simple CRM software for growing teams', metaDesc: 'Example CRM helps small sales teams track deals, automate follow-ups and close faster. Free 14-day trial.', h1: 'The CRM your team will actually use', primaryTopic: 'CRM', wordCount: 940, traffic: 3100, impressions: 42000, clicks: 3100, position: 4.2, keywordCount: 24, internalLinks: 31, externalLinks: 4, inboundLinks: 412, schemaTypes: ['Organization', 'WebSite'], canonical: 'https://example.com/', health: 'GOOD', lastUpdated: d(2) },
  { url: '/crm', title: 'CRM Software | Example', metaDesc: 'A CRM built for small business sales teams.', h1: 'CRM Software', primaryTopic: 'CRM', wordCount: 1120, traffic: 4200, impressions: 18400, clicks: 620, position: 12.8, keywordCount: 12, internalLinks: 8, externalLinks: 2, inboundLinks: 96, schemaTypes: ['SoftwareApplication'], canonical: 'https://example.com/crm', health: 'NEEDS_WORK', lastUpdated: d(-40) },
  { url: '/pricing', title: 'CRM Pricing — Plans from $12/user | Example', metaDesc: 'Transparent CRM pricing. Start free, upgrade when your team grows.', h1: 'Simple, predictable pricing', primaryTopic: 'Pricing', wordCount: 610, traffic: 2100, impressions: 15200, clicks: 2100, position: 6.1, keywordCount: 8, internalLinks: 12, externalLinks: 0, inboundLinks: 74, schemaTypes: ['Product', 'Offer'], canonical: 'https://example.com/pricing', health: 'GOOD', lastUpdated: d(-12) },
  { url: '/crm/pricing', title: 'CRM Pricing | Example', metaDesc: null, h1: 'CRM Pricing', primaryTopic: 'Pricing', wordCount: 480, traffic: 140, impressions: 3100, clicks: 140, position: 18.4, keywordCount: 3, internalLinks: 4, externalLinks: 0, inboundLinks: 3, schemaTypes: [], canonical: null, health: 'POOR', lastUpdated: d(-90) },
  { url: '/features/pipeline', title: 'Visual Sales Pipeline | Example CRM', metaDesc: 'Drag-and-drop deal stages that keep every rep on the same page.', h1: 'Your pipeline, at a glance', primaryTopic: 'Sales pipeline', wordCount: 860, traffic: 980, impressions: 9400, clicks: 980, position: 9.3, keywordCount: 11, internalLinks: 9, externalLinks: 1, inboundLinks: 22, schemaTypes: ['WebPage'], canonical: 'https://example.com/features/pipeline', health: 'GOOD', lastUpdated: d(-25) },
  { url: '/features/automation', title: 'Sales Automation | Example CRM', metaDesc: 'Automate follow-ups, task creation and handoffs.', h1: 'Sales automation without the setup', primaryTopic: 'Sales automation', wordCount: 720, traffic: 540, impressions: 7800, clicks: 540, position: 14.6, keywordCount: 9, internalLinks: 6, externalLinks: 0, inboundLinks: 14, schemaTypes: ['WebPage'], canonical: 'https://example.com/features/automation', health: 'NEEDS_WORK', lastUpdated: d(-58) },
  { url: '/features/integrations', title: 'Integrations | Example CRM', metaDesc: 'Connect Example CRM to Gmail, Slack, Zapier and 60+ tools.', h1: 'Works with the tools you already use', primaryTopic: 'CRM integrations', wordCount: 430, traffic: 310, impressions: 6100, clicks: 310, position: 16.2, keywordCount: 7, internalLinks: 5, externalLinks: 12, inboundLinks: 9, schemaTypes: [], canonical: 'https://example.com/features/integrations', health: 'NEEDS_WORK', lastUpdated: d(-71) },
  { url: '/blog/crm-best-practices', title: '12 CRM Best Practices for Small Sales Teams', metaDesc: 'Practical CRM habits that keep your pipeline clean.', h1: '12 CRM best practices for small sales teams', primaryTopic: 'CRM best practices', wordCount: 2140, traffic: 820, impressions: 11200, clicks: 820, position: 8.7, keywordCount: 18, internalLinks: 14, externalLinks: 6, inboundLinks: 41, schemaTypes: ['Article', 'BreadcrumbList'], canonical: 'https://example.com/blog/crm-best-practices', health: 'GOOD', lastUpdated: d(-33) },
  { url: '/blog/what-is-a-crm', title: 'What Is a CRM? A Plain-English Guide', metaDesc: 'What a CRM does, who needs one and when to buy.', h1: 'What is a CRM?', primaryTopic: 'CRM basics', wordCount: 1680, traffic: 1240, impressions: 24800, clicks: 1240, position: 7.4, keywordCount: 22, internalLinks: 11, externalLinks: 3, inboundLinks: 63, schemaTypes: ['Article', 'FAQPage'], canonical: 'https://example.com/blog/what-is-a-crm', health: 'GOOD', lastUpdated: d(-18) },
  { url: '/blog/sales-follow-up-templates', title: '9 Sales Follow-Up Email Templates', metaDesc: 'Copy-paste follow-up emails that get replies.', h1: '9 sales follow-up email templates', primaryTopic: 'Sales emails', wordCount: 1450, traffic: 690, impressions: 8900, clicks: 690, position: 11.2, keywordCount: 14, internalLinks: 7, externalLinks: 2, inboundLinks: 28, schemaTypes: ['Article'], canonical: 'https://example.com/blog/sales-follow-up-templates', health: 'GOOD', lastUpdated: d(-45) },
  { url: '/blog/lead-scoring-guide', title: 'Lead Scoring: How to Rank Leads That Convert', metaDesc: 'Build a lead scoring model without a data team.', h1: 'Lead scoring guide', primaryTopic: 'Lead management', wordCount: 1320, traffic: 410, impressions: 6400, clicks: 410, position: 13.9, keywordCount: 10, internalLinks: 4, externalLinks: 1, inboundLinks: 11, schemaTypes: ['Article'], canonical: 'https://example.com/blog/lead-scoring-guide', health: 'NEEDS_WORK', lastUpdated: d(-62) },
  { url: '/integrations/slack', title: 'Slack Integration | Example CRM', metaDesc: 'Get deal alerts in Slack.', h1: 'Example CRM for Slack', primaryTopic: 'CRM integrations', wordCount: 290, traffic: 90, impressions: 2200, clicks: 90, position: 19.8, keywordCount: 4, internalLinks: 3, externalLinks: 1, inboundLinks: 4, schemaTypes: [], canonical: 'https://example.com/integrations/slack', health: 'POOR', lastUpdated: d(-120) },
  { url: '/integrations/gmail', title: 'Gmail Integration | Example CRM', metaDesc: 'Log emails to deals automatically.', h1: 'Example CRM for Gmail', primaryTopic: 'CRM integrations', wordCount: 310, traffic: 120, impressions: 2900, clicks: 120, position: 17.5, keywordCount: 5, internalLinks: 3, externalLinks: 1, inboundLinks: 6, schemaTypes: [], canonical: 'https://example.com/integrations/gmail', health: 'POOR', lastUpdated: d(-120) },
  { url: '/customers', title: 'Customer Stories | Example CRM', metaDesc: 'How teams use Example CRM to close more deals.', h1: 'Customer stories', primaryTopic: 'Social proof', wordCount: 520, traffic: 180, impressions: 2400, clicks: 180, position: 15.1, keywordCount: 3, internalLinks: 18, externalLinks: 0, inboundLinks: 19, schemaTypes: ['WebPage'], canonical: 'https://example.com/customers', health: 'GOOD', lastUpdated: d(-20) },
  { url: '/about', title: 'About Example', metaDesc: 'Why we built a CRM for small teams.', h1: 'About Example', primaryTopic: 'Brand', wordCount: 380, traffic: 60, impressions: 900, clicks: 60, position: 8.2, keywordCount: 2, internalLinks: 6, externalLinks: 2, inboundLinks: 31, schemaTypes: ['Organization'], canonical: 'https://example.com/about', health: 'GOOD', lastUpdated: d(-150) },
  { url: '/blog/crm-implementation-checklist', title: 'CRM Implementation Checklist', metaDesc: 'A 14-step rollout plan.', h1: 'CRM implementation checklist', primaryTopic: 'CRM implementation', wordCount: 890, traffic: 210, impressions: 9800, clicks: 210, position: 21.4, keywordCount: 8, internalLinks: 3, externalLinks: 2, inboundLinks: 7, schemaTypes: ['Article'], canonical: 'https://example.com/blog/crm-implementation-checklist', health: 'NEEDS_WORK', lastUpdated: d(-84) },
];

// Pages that do not exist yet but are recommended — rendered as "Opportunity" rows
export const GHOST_PAGES = [
  { url: '/crm-for-startups', title: 'CRM for Startups', primaryTopic: 'CRM startups', health: 'OPPORTUNITY' },
  { url: '/best-crm-small-business', title: 'Best CRM for Small Businesses', primaryTopic: 'CRM small business', health: 'OPPORTUNITY' },
];

export const KEYWORDS = [
  { keyword: 'best crm for small businesses', volume: 5400, difficulty: 63, cpc: 14.2, intent: 'COMMERCIAL', position: null, impressions: 8200, clicks: 40, opportunity: 'HIGH', page: null, aiInsight: 'You have no page targeting this intent. All three tracked competitors rank with a dedicated comparison page.' },
  { keyword: 'best crm for startups', volume: 2400, difficulty: 58, cpc: 12.8, intent: 'COMMERCIAL', position: 21, impressions: 18400, clicks: 180, opportunity: 'HIGH', page: '/crm', aiInsight: 'Your /crm page already collects 18.4K impressions for this cluster but ranks around page 2. A dedicated page would likely outrank it.' },
  { keyword: 'crm vs spreadsheet', volume: 3200, difficulty: 34, cpc: 6.4, intent: 'INFORMATIONAL', position: null, impressions: 2100, clicks: 12, opportunity: 'HIGH', page: null, aiInsight: 'Clear informational gap. Low difficulty relative to your domain rating — a realistic first-page target within 8 weeks.' },
  { keyword: 'what is a crm', volume: 22000, difficulty: 71, cpc: 8.1, intent: 'INFORMATIONAL', position: 7.4, impressions: 24800, clicks: 1240, opportunity: 'MEDIUM', page: '/blog/what-is-a-crm', aiInsight: 'Ranking position 7. Adding a comparison table and FAQ schema is the most likely path into the top 3.' },
  { keyword: 'crm software', volume: 40500, difficulty: 84, cpc: 22.5, intent: 'COMMERCIAL', position: 12.8, impressions: 18400, clicks: 620, opportunity: 'MEDIUM', page: '/crm', aiInsight: 'High difficulty head term. Treat as a long-term target supported by the surrounding cluster rather than a direct push.' },
  { keyword: 'crm implementation', volume: 4800, difficulty: 49, cpc: 18.9, intent: 'COMMERCIAL', position: 21.4, impressions: 9800, clicks: 210, opportunity: 'HIGH', page: '/blog/crm-implementation-checklist', aiInsight: 'PipelineHQ owns this topic with 34 articles. Your single 890-word post is under-built for the intent.' },
  { keyword: 'crm for real estate', volume: 6600, difficulty: 55, cpc: 19.4, intent: 'COMMERCIAL', position: null, impressions: 900, clicks: 3, opportunity: 'HIGH', page: null, aiInsight: 'Part of the "CRM for [industry]" pattern Closerly templates across 41 pages.' },
  { keyword: 'sales pipeline stages', volume: 8100, difficulty: 42, cpc: 9.2, intent: 'INFORMATIONAL', position: 9.3, impressions: 9400, clicks: 980, opportunity: 'MEDIUM', page: '/features/pipeline', aiInsight: 'A feature page is ranking for an informational query — an article would convert this traffic better.' },
  { keyword: 'crm pricing', volume: 3600, difficulty: 47, cpc: 16.1, intent: 'COMMERCIAL', position: 6.1, impressions: 15200, clicks: 2100, opportunity: 'LOW', page: '/pricing', aiInsight: 'Performing well. Protect this page — it is your highest-converting organic entry point.' },
  { keyword: 'free crm', volume: 27100, difficulty: 78, cpc: 11.3, intent: 'COMMERCIAL', position: 28.2, impressions: 6200, clicks: 90, opportunity: 'MEDIUM', page: '/pricing', aiInsight: 'You offer a free tier but never use the word "free" in a page title. Low-effort title test available.' },
  { keyword: 'crm integrations', volume: 1900, difficulty: 38, cpc: 10.5, intent: 'COMMERCIAL', position: 16.2, impressions: 6100, clicks: 310, opportunity: 'MEDIUM', page: '/features/integrations', aiInsight: 'Page is only 430 words against a 1,400-word SERP average. Thin content is the limiting factor.' },
  { keyword: 'lead management software', volume: 5900, difficulty: 61, cpc: 21.7, intent: 'COMMERCIAL', position: null, impressions: 1400, clicks: 8, opportunity: 'HIGH', page: null, aiInsight: 'Adjacent category you can credibly claim. No dedicated page exists.' },
  { keyword: 'sales automation tools', volume: 4400, difficulty: 57, cpc: 17.2, intent: 'COMMERCIAL', position: 14.6, impressions: 7800, clicks: 540, opportunity: 'MEDIUM', page: '/features/automation', aiInsight: 'Close to page one. Expanding use cases and adding schema should be enough.' },
  { keyword: 'crm migration', volume: 1300, difficulty: 31, cpc: 15.8, intent: 'COMMERCIAL', position: null, impressions: 320, clicks: 1, opportunity: 'MEDIUM', page: null, aiInsight: 'Low difficulty, high commercial value, zero coverage. A quick win inside the implementation cluster.' },
  { keyword: 'how to choose a crm', volume: 2900, difficulty: 44, cpc: 13.1, intent: 'INFORMATIONAL', position: 18.9, impressions: 4200, clicks: 120, opportunity: 'MEDIUM', page: '/blog/crm-best-practices', aiInsight: 'Query is being absorbed by a loosely-related post. Deserves its own buying guide.' },
  { keyword: 'crm onboarding', volume: 880, difficulty: 26, cpc: 12.2, intent: 'INFORMATIONAL', position: null, impressions: 210, clicks: 0, opportunity: 'MEDIUM', page: null, aiInsight: 'Very low difficulty. Useful supporting spoke for the implementation pillar.' },
  { keyword: 'crm for consultants', volume: 1600, difficulty: 40, cpc: 16.9, intent: 'COMMERCIAL', position: null, impressions: 480, clicks: 2, opportunity: 'MEDIUM', page: null, aiInsight: 'Another vertical in the "CRM for [industry]" template opportunity.' },
  { keyword: 'sales follow up email', volume: 9900, difficulty: 39, cpc: 5.8, intent: 'INFORMATIONAL', position: 11.2, impressions: 8900, clicks: 690, opportunity: 'MEDIUM', page: '/blog/sales-follow-up-templates', aiInsight: 'One position from the fold. Adding downloadable templates would improve engagement signals.' },
  { keyword: 'lead scoring model', volume: 2200, difficulty: 46, cpc: 14.6, intent: 'INFORMATIONAL', position: 13.9, impressions: 6400, clicks: 410, opportunity: 'MEDIUM', page: '/blog/lead-scoring-guide', aiInsight: 'Under-linked. Only 4 internal links point here from 63 relevant pages.' },
  { keyword: 'crm alternatives', volume: 3300, difficulty: 52, cpc: 18.4, intent: 'COMMERCIAL', position: null, impressions: 1100, clicks: 5, opportunity: 'HIGH', page: null, aiInsight: 'SalesNest ranks top-5 here with a page you have no equivalent for.' },
  { keyword: 'crm for agencies', volume: 2700, difficulty: 48, cpc: 17.8, intent: 'COMMERCIAL', position: null, impressions: 620, clicks: 3, opportunity: 'MEDIUM', page: null, aiInsight: 'Vertical page opportunity with above-average commercial value.' },
  { keyword: 'small business crm software', volume: 4100, difficulty: 60, cpc: 19.1, intent: 'COMMERCIAL', position: 24.6, impressions: 5200, clicks: 70, opportunity: 'HIGH', page: '/crm', aiInsight: 'Same page competing for two distinct intents. Splitting them should lift both.' },
  { keyword: 'gmail crm', volume: 1800, difficulty: 35, cpc: 9.9, intent: 'COMMERCIAL', position: 17.5, impressions: 2900, clicks: 120, opportunity: 'MEDIUM', page: '/integrations/gmail', aiInsight: 'Integration page is 310 words. Competitors average 900 on the same query.' },
  { keyword: 'slack crm integration', volume: 720, difficulty: 29, cpc: 8.4, intent: 'COMMERCIAL', position: 19.8, impressions: 2200, clicks: 90, opportunity: 'LOW', page: '/integrations/slack', aiInsight: 'Low volume but very low difficulty. Bundle into a batch integration-page refresh.' },
];
