// September 2026 plan. "Today" in the prototype is Sep 14, 2026.
export const CALENDAR = [
  { day: 2,  type: 'BLOG',   title: 'Best CRM for Small Businesses', targetUrl: '/best-crm-small-business', status: 'DONE' },
  { day: 4,  type: 'BLOG',   title: 'CRM vs Spreadsheet', targetUrl: '/blog/crm-vs-spreadsheet', status: 'DONE' },
  { day: 7,  type: 'UPDATE', title: 'Improve /crm', targetUrl: '/crm', status: 'DONE' },
  { day: 9,  type: 'BLOG',   title: 'Lead management guide', targetUrl: '/blog/lead-management', status: 'DONE' },
  { day: 11, type: 'PAGE',   title: 'CRM for startups', targetUrl: '/crm-for-startups', status: 'IN_PROGRESS' },
  { day: 12, type: 'BLOG',   title: 'Best CRM for Startups', targetUrl: '/blog/best-crm-for-startups', status: 'IN_PROGRESS' },
  { day: 14, type: 'BLOG',   title: 'CRM implementation guide', targetUrl: '/blog/crm-implementation', status: 'PLANNED' },
  { day: 16, type: 'UPDATE', title: 'Update /crm integrations section', targetUrl: '/features/integrations', status: 'PLANNED' },
  { day: 17, type: 'INTERNAL_LINKING', title: 'Internal linking pass — 12 pages', targetUrl: null, status: 'PLANNED' },
  { day: 18, type: 'BLOG',   title: 'Sales Pipeline Guide', targetUrl: '/blog/sales-pipeline-guide', status: 'PLANNED' },
  { day: 21, type: 'PAGE',   title: 'CRM implementation', targetUrl: '/crm-implementation', status: 'PLANNED' },
  { day: 22, type: 'TECHNICAL', title: 'Fix canonical + duplicate titles', targetUrl: '/crm/pricing', status: 'PLANNED' },
  { day: 23, type: 'BLOG',   title: 'CRM migration checklist', targetUrl: '/blog/crm-migration', status: 'PLANNED' },
  { day: 25, type: 'REFRESH', title: 'Refresh "What is a CRM?"', targetUrl: '/blog/what-is-a-crm', status: 'PLANNED' },
  { day: 28, type: 'PAGE',   title: 'CRM for real estate', targetUrl: '/crm-for-real-estate', status: 'PLANNED' },
  { day: 29, type: 'BLOG',   title: 'CRM onboarding in 30 days', targetUrl: '/blog/crm-onboarding', status: 'PLANNED' },
  { day: 30, type: 'UPDATE', title: 'Expand Slack + Gmail pages', targetUrl: '/integrations/slack', status: 'PLANNED' },
];

export const BRIEFS = [
  {
    key: 'startups',
    targetKeyword: 'best crm for startups',
    intent: 'COMMERCIAL',
    recommendedUrl: '/best-crm-for-startups',
    suggestedTitle: 'Best CRM for Startups: 10 Options Compared (2026)',
    metaDesc: 'We compared 10 CRMs on price, setup time and startup-specific features. Here is what actually works under 20 people.',
    searchVolume: 2400,
    difficulty: 58,
    targetWords: 2200,
    outline: [
      { tag: 'H1', text: 'Best CRM for Startups: 10 Options Compared', notes: 'Lead with the comparison promise, not the brand.' },
      { tag: 'H2', text: 'What makes a CRM right for a startup', notes: 'Set the evaluation criteria before the list — this is what the top-ranking pages all do.' },
      { tag: 'H2', text: 'The 10 best CRMs for startups', notes: 'One H3 per tool. Include price, best-for, and one honest limitation each.' },
      { tag: 'H2', text: 'Comparison table', notes: 'Price, free tier, setup time, integrations, best for. Tables win featured snippets here.' },
      { tag: 'H2', text: 'How to choose: a 5-question checklist', notes: 'Decision framework — this is the section competitors are missing.' },
      { tag: 'H2', text: 'When you do not need a CRM yet', notes: 'Counter-intuitive section that earns trust and links.' },
      { tag: 'H2', text: 'Frequently asked questions', notes: 'Mark up with FAQPage schema. Pull the 6 PAA questions.' },
    ],
    entities: ['CRM', 'startup', 'sales pipeline', 'lead management', 'free tier', 'Series A', 'product-led growth', 'customer data'],
    internalLinks: ['/crm', '/pricing', '/blog/what-is-a-crm', '/features/pipeline', '/blog/crm-best-practices'],
    competitors: ['pipelinehq.com/blog/best-crm-startups', 'closerly.com/startup-crm', 'salesnest.io/blog/crm-for-startups'],
    questions: ['Do startups really need a CRM?', 'When should a startup buy a CRM?', 'What is the cheapest CRM for a startup?', 'Can you use a spreadsheet instead of a CRM?', 'How long does CRM setup take?', 'Which CRM integrates with Gmail?'],
  },
  {
    key: 'smallbiz',
    targetKeyword: 'best crm for small businesses',
    intent: 'COMMERCIAL',
    recommendedUrl: '/best-crm-small-business',
    suggestedTitle: 'Best CRM for Small Businesses: 10 Tools Compared (2026)',
    metaDesc: 'A practical comparison of 10 small-business CRMs on price, ease of setup and support. Updated September 2026.',
    searchVolume: 5400,
    difficulty: 63,
    targetWords: 2400,
    outline: [
      { tag: 'H1', text: 'Best CRM for Small Businesses: 10 Tools Compared', notes: '' },
      { tag: 'H2', text: 'How we evaluated', notes: 'Establish methodology — builds trust and E-E-A-T.' },
      { tag: 'H2', text: 'The 10 best small business CRMs', notes: 'H3 per tool.' },
      { tag: 'H2', text: 'Feature and price comparison', notes: 'Table.' },
      { tag: 'H2', text: 'What small businesses get wrong about CRM', notes: '' },
      { tag: 'H2', text: 'FAQ', notes: 'FAQPage schema.' },
    ],
    entities: ['CRM', 'small business', 'sales team', 'contact management', 'pipeline', 'automation', 'pricing'],
    internalLinks: ['/crm', '/pricing', '/customers', '/blog/crm-best-practices'],
    competitors: ['pipelinehq.com/best-crm-small-business', 'closerly.com/small-business', 'salesnest.io/small-business-crm'],
    questions: ['What is the best CRM for a small business?', 'How much does a small business CRM cost?', 'Is there a free CRM?', 'Do I need a CRM with 3 employees?'],
  },
];

const ARTICLE_STARTUPS = `## What makes a CRM right for a startup

Most CRM comparisons are written for companies that already have a sales team. Startups have a different problem: you have two or three people selling, no dedicated admin, and no appetite for a six-week implementation. The tool has to be useful in an afternoon or it will not get used at all.

That reframes the criteria. Depth of reporting matters less than how quickly a new rep can find a deal. Enterprise permission models matter less than whether the free tier survives your next five hires. We weighted four things:

- **Time to first useful day.** Can one founder set it up without a consultant?
- **Price at 20 people, not 3.** Free tiers that collapse at seat 6 are a migration waiting to happen.
- **Email and calendar sync quality.** This is where startups actually live.
- **An export path.** You will outgrow something. Make sure it is not your data.

## The 10 best CRMs for startups

### 1. Example CRM — best overall for teams under 20

Free for three users, then $12/user/month. Setup takes about twenty minutes because the pipeline ships with sensible defaults instead of an empty canvas. Two-way Gmail sync logs every message against the right deal without a browser extension.

*Limitation:* reporting is deliberately simple. If you need cohort-level revenue attribution, you will hit the ceiling around thirty people.

### 2. PipelineHQ — best for teams that will hire fast

Strong automation and the deepest reporting in this list. The trade-off is setup: expect a week, and expect to want help with it.

*Limitation:* pricing jumps sharply at the tier where automation becomes useful.

### 3. Closerly — best for industry-specific workflows

Closerly ships vertical templates for real estate, agencies and consulting. If you are in one of those, you start ahead.

*Limitation:* outside its templated verticals it feels generic.

### 4. SalesNest — best free tier

The most generous free plan here: five users, unlimited contacts. Genuinely workable for a pre-revenue team.

*Limitation:* email sync is one-way, which causes quiet data gaps.

## Comparison table

| Tool | Free tier | Paid from | Setup time | Best for |
| --- | --- | --- | --- | --- |
| Example CRM | 3 users | $12/user | ~20 min | Teams under 20 |
| PipelineHQ | 14-day trial | $29/user | ~1 week | Fast-scaling teams |
| Closerly | 2 users | $19/user | ~2 days | Vertical workflows |
| SalesNest | 5 users | $15/user | ~1 hour | Pre-revenue teams |

## How to choose: a 5-question checklist

1. How many people will touch it in twelve months, and what does it cost then?
2. Does it sync email two ways, or will reps copy-paste?
3. Can a new hire find last quarter's deal in under a minute?
4. What happens to your data if you leave?
5. Is anyone on the team actually going to own it?

If you cannot answer question five, the tool is not your problem yet.

## When you do not need a CRM yet

Under roughly fifty active contacts and one person selling, a spreadsheet is genuinely fine — and switching costs you a week you do not have. The signal to move is not headcount. It is the first time a deal goes cold because nobody remembered to follow up.

## Frequently asked questions

**Do startups really need a CRM?**
Not on day one. You need one when more than one person is responsible for following up, or when you stop being able to hold the pipeline in your head.

**What is the cheapest CRM for a startup?**
SalesNest has the most generous free tier at five users. Example CRM is free for three and the cheapest paid option at $12/user/month.

**How long does CRM setup take?**
Between twenty minutes and a week depending on the tool. Anything quoting longer than that is built for a company larger than yours.`;

export const CONTENT = [
  {
    key: 'startups', title: 'Best CRM for Startups: 10 Options Compared (2026)', slug: 'best-crm-for-startups',
    status: 'DRAFT', targetKeyword: 'best crm for startups', wordCount: 2240, seoScore: 86,
    excerpt: 'We compared 10 CRMs on price, setup time and startup-specific features.',
    body: ARTICLE_STARTUPS, briefKey: 'startups', scheduledDay: 12,
  },
  {
    key: 'smallbiz', title: 'Best CRM for Small Businesses: 10 Tools Compared (2026)', slug: 'best-crm-small-business',
    status: 'PUBLISHED', targetKeyword: 'best crm for small businesses', wordCount: 2410, seoScore: 91,
    excerpt: 'A practical comparison of 10 small-business CRMs on price, ease of setup and support.',
    body: '## How we evaluated\n\nWe scored each tool on price at scale, setup time, email sync quality and export freedom — the four things small teams tell us actually decide the outcome.\n\n## The 10 best small business CRMs\n\n### 1. Example CRM\n\nFree for three users, $12/user/month after. The fastest setup in the group.\n\n### 2. PipelineHQ\n\nDeepest reporting, slowest onboarding.\n\n## What small businesses get wrong about CRM\n\nThe common mistake is buying for the company you plan to be in three years. You will migrate anyway. Buy for the next twelve months and keep your export path clean.',
    briefKey: 'smallbiz', publishedDay: 2,
  },
  {
    key: 'vs', title: 'CRM vs Spreadsheet: When to Make the Switch', slug: 'crm-vs-spreadsheet',
    status: 'PUBLISHED', targetKeyword: 'crm vs spreadsheet', wordCount: 1640, seoScore: 88,
    excerpt: 'Spreadsheets work longer than most vendors admit. Here is the actual switching point.',
    body: '## Spreadsheets are underrated\n\nFor one person and fifty contacts, a spreadsheet beats every CRM on this page. It is faster to edit, free, and nobody needs training.\n\n## The four signals it is time to switch\n\n1. Two or more people edit the same sheet.\n2. A deal went cold because nobody owned the follow-up.\n3. You cannot answer "what closed last month" in under a minute.\n4. You are copy-pasting email threads into cells.\n\n## What you gain, honestly\n\nAutomatic activity capture, shared ownership, and history. What you lose is flexibility — a CRM has opinions your spreadsheet does not.',
    publishedDay: 4,
  },
  {
    key: 'impl', title: 'CRM Implementation: A 30-Day Rollout Plan', slug: 'crm-implementation-30-day-plan',
    status: 'SCHEDULED', targetKeyword: 'crm implementation', wordCount: 0, seoScore: 0,
    excerpt: 'Scheduled for Sep 21 — brief approved, generation pending.',
    body: '', scheduledDay: 21,
  },
  {
    key: 'pipeline', title: 'Sales Pipeline Stages: The Complete Guide', slug: 'sales-pipeline-guide',
    status: 'SCHEDULED', targetKeyword: 'sales pipeline stages', wordCount: 0, seoScore: 0,
    excerpt: 'Scheduled for Sep 18.', body: '', scheduledDay: 18,
  },
  {
    key: 'crmupdate', title: 'Update: /crm — title, integrations section, FAQ', slug: 'update-crm-page',
    status: 'UPDATE', targetKeyword: 'crm software', wordCount: 1120, seoScore: 74,
    excerpt: '5 AI recommendations pending review on the /crm page.',
    body: 'Pending changes to /crm:\n\n1. Title rewrite for intent match\n2. Integrations section expansion (+400 words)\n3. Internal links to 6 cluster pages\n4. FAQ section with FAQPage schema\n5. Split small-business intent to a new URL',
  },
];
