import { db } from './db';
import type { ContentBrief, Opportunity } from '@prisma/client';

/**
 * Brief and article synthesis.
 *
 * There is no model call here — the prototype composes from what the crawl and
 * keyword tables actually contain, which keeps every generated document
 * consistent with the numbers shown elsewhere in the UI.
 */

type OutlineSection = { tag: string; text: string; notes?: string };

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 70);

/** Derive a brief from an opportunity, reusing a hand-written one when it exists. */
export async function buildBrief(siteId: string, opportunity: Opportunity): Promise<ContentBrief> {
  const existing = await db.contentBrief.findFirst({
    where: { siteId, targetKeyword: { equals: opportunity.subject, mode: 'insensitive' } },
  });
  if (existing) return existing;

  const [keyword, competitors, linkTargets] = await Promise.all([
    db.keyword.findFirst({ where: { siteId, keyword: { equals: opportunity.subject, mode: 'insensitive' } } }),
    db.competitor.findMany({ where: { siteId }, orderBy: { organicTraffic: 'desc' }, take: 3 }),
    db.page.findMany({ where: { siteId, indexable: true }, orderBy: { inboundLinks: 'desc' }, take: 5 }),
  ]);

  const kw = opportunity.subject;
  const volume = opportunity.searchVolume ?? keyword?.volume ?? 0;
  const difficulty = opportunity.difficulty ?? keyword?.difficulty ?? 40;
  const comparison = /\bvs\b|\bversus\b|\balternative/i.test(kw);
  const listicle = /\bbest\b|\btop\b/i.test(kw);
  const commercial = comparison || listicle || /software|tool|pricing|for /i.test(kw);
  // Target length is page-type specific — comparison queries reward tighter
  // pages than listicles do, and over-padding them is a ranking liability.
  const targetWords = listicle ? 2400 : comparison ? 1600 : commercial ? 1500 : 1400;

  const title = comparison
    ? `${titleish(kw)}: Which One Actually Fits Your Team (2026)`
    : listicle
      ? `${titleish(kw)}: 10 Options Compared (2026)`
      : commercial
        ? `${titleish(kw)}: What to Look For (2026)`
        : `${titleish(kw)}: A Practical Guide`;

  const outline: OutlineSection[] = comparison
    ? [
        { tag: 'H1', text: titleish(kw), notes: 'Name both sides in the H1 — the query is a direct comparison.' },
        { tag: 'H2', text: 'The short answer', notes: 'Answer in the first 60 words. This is the featured-snippet target.' },
        { tag: 'H2', text: 'Where each one wins', notes: 'Two balanced subsections. Being fair here is what earns the link.' },
        { tag: 'H2', text: 'Side-by-side comparison', notes: 'Table. The SERP shows a table snippet for this query.' },
        { tag: 'H2', text: 'The four signals it is time to switch', notes: 'The decision trigger — this is the section competitors skip.' },
        { tag: 'H2', text: 'How to migrate without losing data', notes: 'Practical steps. Converts readers who already decided.' },
        { tag: 'H2', text: 'Frequently asked questions', notes: 'Mark up with FAQPage schema.' },
      ]
    : commercial
    ? [
        { tag: 'H1', text: titleish(kw), notes: 'Lead with the comparison promise, not the brand.' },
        { tag: 'H2', text: 'How we evaluated', notes: 'State the criteria before the list — every top-ranking page does this.' },
        { tag: 'H2', text: `The best options for ${kw.replace(/^best\s+/i, '')}`, notes: 'One H3 per tool, each with an honest limitation.' },
        { tag: 'H2', text: 'Comparison table', notes: 'The SERP shows a table snippet — this section is the snippet target.' },
        { tag: 'H2', text: 'How to choose', notes: 'A decision framework. This is the section competitors are missing.' },
        { tag: 'H2', text: 'When you do not need one yet', notes: 'Counter-intuitive section that earns links and trust.' },
        { tag: 'H2', text: 'Frequently asked questions', notes: 'Mark up with FAQPage schema.' },
      ]
    : [
        { tag: 'H1', text: titleish(kw), notes: '' },
        { tag: 'H2', text: `What ${kw} actually means`, notes: 'Answer the query in the first 60 words — snippet target.' },
        { tag: 'H2', text: 'Why it matters', notes: '' },
        { tag: 'H2', text: 'Step by step', notes: 'Numbered list. Eligible for a how-to snippet.' },
        { tag: 'H2', text: 'Common mistakes', notes: '' },
        { tag: 'H2', text: 'Frequently asked questions', notes: 'FAQPage schema.' },
      ];

  return db.contentBrief.create({
    data: {
      siteId,
      opportunityId: opportunity.id,
      targetKeyword: kw,
      intent: commercial ? 'COMMERCIAL' : 'INFORMATIONAL',
      recommendedUrl: `/${slugify(kw)}`,
      suggestedTitle: title,
      metaDesc: `${titleish(kw)} — compared on price, setup time and real-world fit. Updated September 2026.`,
      searchVolume: volume,
      difficulty,
      targetWords,
      outline,
      entities: entitiesFor(kw),
      internalLinks: linkTargets.map((p) => p.url),
      competitors: competitors.map((c) => `${c.domain}/${slugify(kw)}`),
      questions: questionsFor(kw),
    },
  });
}

/** Compose an article body from a brief. */
export async function buildArticle(siteId: string, brief: ContentBrief) {
  const existing = await db.contentPiece.findFirst({ where: { siteId, briefId: brief.id, body: { not: '' } } });
  if (existing) return existing;

  const outline = (brief.outline as unknown as OutlineSection[]) ?? [];
  const kw = brief.targetKeyword;

  const parts: string[] = [intro(kw, brief)];
  for (const s of outline) {
    if (s.tag === 'H1') continue;
    parts.push(`## ${s.text}`);
    parts.push(bodyFor(s.text, kw));
  }

  const body = parts.join('\n\n');
  const wordCount = body.split(/\s+/).filter(Boolean).length;

  const slug = slugify(brief.suggestedTitle).slice(0, 60);
  return db.contentPiece.upsert({
    where: { siteId_slug: { siteId, slug } },
    update: { body, wordCount, seoScore: scoreFor(brief, wordCount) },
    create: {
      siteId,
      briefId: brief.id,
      title: brief.suggestedTitle,
      slug,
      status: 'DRAFT',
      body,
      wordCount,
      seoScore: scoreFor(brief, wordCount),
      excerpt: brief.metaDesc,
      targetKeyword: kw,
    },
  });
}

function scoreFor(brief: ContentBrief, words: number): number {
  let score = 60;
  if (words >= brief.targetWords * 0.85) score += 14;
  else if (words >= brief.targetWords * 0.6) score += 8;
  if (brief.internalLinks.length >= 4) score += 7;
  if (brief.entities.length >= 6) score += 6;
  if (brief.questions.length >= 4) score += 6;
  if (brief.difficulty < 50) score += 4;
  return Math.min(97, score);
}

const ACRONYMS = new Set(['crm', 'seo', 'saas', 'api', 'roi', 'b2b', 'b2c', 'cms', 'kpi', 'ai', 'erp', 'sms', 'url', 'faq', 'ux', 'ui']);
const SMALL = new Set(['a', 'an', 'and', 'the', 'for', 'or', 'to', 'of', 'in', 'on', 'vs', 'with', 'without']);

/** Title-case a keyword, keeping known acronyms upper and small words lower. */
const titleish = (s: string) =>
  s
    .split(/\s+/)
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      if (i > 0 && SMALL.has(lower)) return lower;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');

function entitiesFor(kw: string): string[] {
  const base = ['CRM', 'sales pipeline', 'lead management', 'customer data', 'automation', 'integrations', 'onboarding'];
  const extra = kw.split(/\s+/).filter((w) => w.length > 3);
  return Array.from(new Set([...extra, ...base])).slice(0, 9);
}

function questionsFor(kw: string): string[] {
  return [
    `What is the best option for ${kw}?`,
    `How much does ${kw} cost?`,
    `Is there a free version?`,
    `How long does setup take?`,
    `What should you look for first?`,
  ];
}

/** Opening paragraphs. Answers the query immediately — the snippet target. */
function intro(kw: string, brief: ContentBrief): string {
  const vol = brief.searchVolume ? `${brief.searchVolume.toLocaleString()} people look this up every month` : 'This comes up constantly';
  return `${vol}, and most of what they find is a feature list with a signup button underneath it. This page is not that. It is an attempt to answer the question properly, including the parts that argue against buying anything.\n\nWe have set out the criteria that actually decide the outcome, compared the realistic options against them, and been specific about where each one falls down. If you only read one section, read the decision checklist — it is the part teams tell us changed what they did.`;
}

/** Four option blocks for comparison and listicle pages. */
function optionBlocks(): string {
  const tools = [
    {
      name: 'Example CRM', tag: 'best overall for teams under 20',
      body: 'Free for three users, then $12 per user per month. Setup takes about twenty minutes because the pipeline ships with sensible defaults rather than an empty canvas you have to design. Two-way Gmail sync logs every message against the right deal without a browser extension, which is the difference between a record that stays accurate and one that decays over a quarter.',
      limit: 'Reporting is deliberately simple. If you need cohort-level revenue attribution you will hit the ceiling somewhere around thirty people.',
    },
    {
      name: 'PipelineHQ', tag: 'best for teams that will hire fast',
      body: 'The deepest automation and reporting in this list, and the only one here that will still be sufficient at two hundred people. Workflow rules are genuinely powerful — you can encode an entire handoff process rather than documenting it and hoping.',
      limit: 'Expect a week of setup and expect to want help with it. Pricing also jumps sharply at exactly the tier where the automation becomes useful, which is not an accident.',
    },
    {
      name: 'Closerly', tag: 'best for industry-specific workflows',
      body: 'Ships vertical templates for real estate, agencies and consulting, each with stages and fields that match how those businesses actually work. If you are in one of them you start several weeks ahead of everyone else on this list.',
      limit: 'Outside its templated verticals it feels generic, and the template is hard to unpick once you have built on top of it.',
    },
    {
      name: 'SalesNest', tag: 'best free tier',
      body: 'The most generous free plan here — five users and unlimited contacts, with no meaningful feature gate. For a pre-revenue team this is genuinely workable rather than a trial in disguise.',
      limit: 'Email sync is one-way, which produces quiet data gaps. You will not notice them until someone asks what was said to a customer in March.',
    },
  ];
  return tools
    .map((t, i) => `### ${i + 1}. ${t.name} — ${t.tag}\n\n${t.body}\n\n*Limitation:* ${t.limit}`)
    .join('\n\n');
}

/** Section prose. Deliberately opinionated — the product's voice is a teammate, not a content mill. */
function bodyFor(heading: string, kw: string): string {
  const h = heading.toLowerCase();

  if (h.includes('the best') || h.startsWith('the ') && h.includes('options') || h.includes('best options')) {
    return optionBlocks();
  }

  if (h.includes('what to look for') || h.includes('criteria') || h.includes('what matters')) {
    return `Four things decide this, and none of them appear on a comparison table.\n\n**Does it match how the work already happens?** Tools that require you to change your process first get abandoned in week three. The question is not whether the process is optimal — it is whether the tool can hold it as it is today, and bend as it changes.\n\n**How much does it cost to be wrong?** Look at the export, the contract length and the migration path before you look at the feature list. Every team in this category changes their mind at least once. The tools that make that cheap are worth more than the ones that are marginally better on paper.\n\n**Who maintains it on a bad week?** Not who owns it on the org chart — who actually updates it when the quarter is closing and everyone is busy. If the answer is "it updates itself", you have found the right one. If the answer is a person's name, you have found a risk.\n\n**What happens at three times your current size?** Not thirty times. Three. That is the horizon where the decision actually plays out, and pricing tiers, permission models and reporting all tend to bite at that scale rather than at the extremes vendors design their marketing around.`;
  }

  if (h.includes('short answer')) {
    return `If you are choosing between them today: keep what you have until a specific thing breaks, then switch to the option that fixes that one thing. The cost of switching early is a week of setup and a month of half-adoption. The cost of switching late is measured in deals nobody followed up on.\n\nThe rest of this page is about how to tell which situation you are in, because the honest answer depends on how many people touch the process and how often the record is wrong.`;
  }
  if (h.includes('where each one wins')) {
    return `### Where the simpler option wins\n\nFor one person and under fifty active records, the simpler option is genuinely better. It is faster to edit, costs nothing, needs no training, and bends to whatever shape your process is this month. Teams that switch away from it too early usually end up maintaining both for a quarter, which is worse than either.\n\nIt also wins on a dimension people forget: you can see everything at once. That stops being an advantage somewhere around two hundred records, but before that it is real.\n\n### Where the dedicated tool wins\n\nThe moment more than one person owns follow-up, the shared record stops being reliable. Two people edit the same row, one of them is working from yesterday's version, and a deal goes quiet. A dedicated tool solves this by making history automatic rather than something someone remembers to write down.\n\nThe second advantage is activity capture. Email and calendar sync means the record updates itself, which is the only mechanism that survives a busy quarter. Anything that depends on discipline decays.`;
  }
  if (h.includes('side-by-side') || h.includes('comparison table') || h.includes('table')) {
    return `| | Spreadsheet | Dedicated CRM |\n| --- | --- | --- |\n| Cost | Free | $12–29/user/month |\n| Setup time | Minutes | 20 minutes to 1 week |\n| Shared editing | Conflicts above 2 people | Built in |\n| Activity history | Manual | Automatic |\n| Email sync | None | Two-way |\n| Reporting | You build it | Ships with it |\n| Flexibility | Total | Constrained by the model |\n\nThe row that decides it is usually activity history, not cost.`;
  }
  if (h.includes('signals') || h.includes('time to switch')) {
    return `Headcount is the wrong trigger. These four are the ones that actually predict it:\n\n1. **Two or more people edit the same record.** The moment there is a second editor, the version everyone trusts stops existing.\n2. **A deal went cold because nobody owned the follow-up.** This is the expensive one, and it is usually the first to happen.\n3. **You cannot answer "what closed last month" in under a minute.** If the answer requires reconstruction, the record is already unreliable.\n4. **You are copy-pasting email threads into cells.** That is a sync problem being solved by hand.\n\nOne of these on its own is survivable. Two together is the switch.`;
  }
  if (h.includes('migrate') || h.includes('migration')) {
    return `Migration goes wrong in predictable ways, and all of them are avoidable.\n\n1. Export what you have as CSV and open it. Half the cleanup is visible immediately — duplicate contacts, blank owners, statuses that mean nothing.\n2. Decide your stages before you import, not after. Importing into default stages and renaming later leaves history attached to the wrong labels.\n3. Import a hundred records first, not all of them. You will find the mapping mistake on the small batch.\n4. Connect email before anyone starts using it. Records created before sync is on have no history, and nobody goes back to fill it in.\n5. Keep the old file read-only for a month. Do not delete it, and do not let anyone edit it.\n\nBudget half a day. Teams that budget a week usually spend a week because the scope expands to fill it.`;
  }

  if (h.includes('how we evaluated') || h.includes('evaluated')) {
    return `Most comparisons in this category score on feature count, which is the least useful signal available. Every tool here has contacts, deals and a pipeline view; listing them tells you nothing about which one your team will still be using in six months.\n\nWe weighted four things instead:\n\n- **Time to a first useful day.** Can one person set it up without a consultant, and does it do something valuable before anyone has finished configuring it?\n- **Price at twenty people, not three.** Free tiers that collapse at seat six are a migration waiting to happen, and migrations cost more than the licence ever did.\n- **Email and calendar sync quality.** This is where teams actually live. One-way sync produces quiet data gaps that nobody notices until a quarter-end review.\n- **Export freedom.** You will outgrow something. Make sure it is not your own data.\n\nThat last one gets ignored most often and it is the one that hurts. Two of the tools below make a clean export genuinely difficult, and we have said so.`;
  }
  if (h.includes('comparison table') || h.includes('table')) {
    return `| Tool | Free tier | Paid from | Setup time | Best for |\n| --- | --- | --- | --- | --- |\n| Example CRM | 3 users | $12/user | ~20 min | Teams under 20 |\n| PipelineHQ | 14-day trial | $29/user | ~1 week | Fast-scaling teams |\n| Closerly | 2 users | $19/user | ~2 days | Vertical workflows |\n| SalesNest | 5 users | $15/user | ~1 hour | Pre-revenue teams |\n\nPrices are list prices as of September 2026 and exclude annual discounts.`;
  }
  if (h.includes('how to choose') || h.includes('choose')) {
    return `Five questions, in order. If you cannot answer the last one, the tool is not your problem yet.\n\n1. **How many people will touch it in twelve months, and what does it cost then?** Price the tier you will be on, not the one you start on. The jump between tiers is usually where the real cost is.\n2. **Does it sync email two ways, or will your team copy-paste?** One-way sync looks fine in a demo and produces silent gaps in practice.\n3. **Can a new hire find last quarter's deal in under a minute?** Run this as an actual test during the trial. It is the single best proxy for whether the record is trustworthy.\n4. **What happens to your data if you leave?** Ask for a sample export before you buy. A vendor that hesitates has told you something.\n5. **Is anyone actually going to own it?** Not administer it full time — just notice when it drifts and fix it.\n\nWork through these with the two people who will use it most, not with whoever is paying. The answers are different, and the second set is the one that predicts adoption.`;
  }
  if (h.includes('do not need') || h.includes("don't need")) {
    return `Under roughly fifty active contacts with one person selling, a spreadsheet genuinely wins. It is faster to edit, costs nothing, needs no training, and bends to whatever shape your process happens to be this month. Switching early costs you a week you do not have and gives you back visibility you did not need yet.\n\nWe say this knowing it argues against buying anything. It is still the right answer at that stage, and teams that hear it tend to come back when the situation actually changes.\n\nThe signal to move is not headcount and it is not revenue. It is the first time a deal goes cold because nobody remembered to follow up — because that failure repeats, and it gets more expensive as the pipeline grows. If that has not happened yet, you have time.`;
  }
  if (h.includes('frequently asked') || h.includes('faq')) {
    return `**Do you need ${kw} straight away?**\nNot on day one. You need it when more than one person owns follow-up, or when you can no longer hold the pipeline in your head. Before that, the overhead of maintaining it costs more than the visibility it gives you.\n\n**What does it cost?**\nEntry pricing in this category runs $12–29 per user per month. The free tiers are real but most cap out between three and five seats, so price the plan you will be on in a year rather than the one you start on.\n\n**How long does setup take?**\nBetween twenty minutes and a week depending on the tool and how much historical data you bring. Anything quoting longer than a week is built for a larger company than yours, and the implementation cost will keep showing up in other ways.\n\n**Can you migrate later if you choose wrong?**\nYes, and most teams do it at least once. What matters is whether the export is clean — contacts, deals, notes and activity history in a usable format. Check that before you commit, not after.\n\n**What is the most common mistake?**\nRolling out to everyone at once. Start with the two people who feel the pain most. They become the internal case for everybody else, and if the tool cannot convince them it will not convince anyone.\n\n**Does it need a dedicated owner?**\nSomeone has to care about it, but it does not need to be a full-time job at this size. What it needs is one person who notices when the data stops being trustworthy and fixes it that week rather than that quarter.`;
  }
  if (h.includes('common mistakes') || h.includes('mistakes')) {
    return `**Buying for the company you plan to be in three years.** This is the expensive one. You will migrate anyway — almost everyone does, at least once — so plan for the next twelve months and keep the export path clean. Paying now for capability you will not use for two years means paying for it during the period when cash is tightest and the tool is least adopted.\n\n**Rolling out to everyone at once.** Start with the two people who feel the pain most. They become the internal case for everybody else, and if the tool cannot win them over it was never going to survive a full rollout.\n\n**Configuring before using.** Teams spend three weeks designing custom fields and stages for a process they have not run yet. Use the defaults for a month, notice what genuinely does not fit, then change that. Configuration built on guesses has to be unpicked later, and unpicking is harder than building.\n\n**Treating it as a reporting obligation.** The moment people update it because a manager asks rather than because it helps them, the data quality question is already decided. Everything after that is enforcement, and enforcement does not scale.\n\n**Skipping the email connection.** It seems optional during setup and it is the single highest-leverage thing in the whole system. Records created before sync is switched on have no history attached, and nobody ever goes back to fill it in.`;
  }
  if (h.includes('step by step') || h.includes('step')) {
    return `1. **Write down the three questions you currently cannot answer** about your pipeline. Be specific — "how many deals stalled after the demo last quarter" rather than "better visibility". These become your acceptance criteria, and without them every tool looks fine.\n2. **Shortlist two options, not five.** Evaluating five takes four times as long and produces a worse decision, because nobody runs a real test five times.\n3. **Import a real slice of your data** — a hundred actual records, not the sample set. The mapping problems only appear on real data, and you want to find them before they are load-bearing.\n4. **Run one real week on each.** Not a demo, not a sandbox. Actual deals, actual follow-ups, actual mess.\n5. **Choose the one your team reopened without being asked.** This is the only signal that predicts adoption, and it beats every feature comparison you could run.\n\nThe whole process should take two weeks. Teams that budget two months usually spend two months, because the evaluation expands to fill the time and the decision does not get better.\n\nOne thing to avoid: do not let the person who will use it least make the decision. The most common failure in this category is a tool chosen for its reporting by someone who will never enter a record into it.`;
  }
  if (h.includes('why it matters')) {
    return `The measurable cost is not the tooling, it is the follow-ups nobody made. Across the teams we have onboarded, the first month after adoption usually surfaces between six and twelve conversations that had quietly gone dormant — not because anyone was careless, but because the record lived in someone's head and that person had a busy fortnight.\n\nThat is the whole return, and it happens before anyone opens a report. Everything downstream — forecasting, attribution, capacity planning — is built on the same foundation, and none of it works if the underlying record is not trustworthy.\n\nThere is a second cost that is harder to see. When the data is unreliable, people stop using it to make decisions and start relying on instinct instead. That is fine while the team is small enough for one person's instinct to cover everything. It stops working at roughly the same point the data stops being maintained, which is why the two failures usually arrive together.\n\nThe teams that get this right treat the record as infrastructure rather than reporting. It is not there to tell a manager what happened last month; it is there so the next person to touch the account knows what was already said.`;
  }
  if (h.includes('what') && h.includes('means')) {
    return `In plain terms, ${kw} is about keeping one shared record of every conversation with a customer, so that the next person to touch the account knows what already happened. Everything else — reporting, automation, forecasting, handovers — is built on that single fact being reliable.\n\nIf the record is not trustworthy, no amount of tooling on top of it helps. This is worth stating plainly because most of the advice in this category skips it and goes straight to features, which is how teams end up with a well-configured system nobody trusts.\n\n### What it is not\n\nIt is not a reporting tool, although it produces reports. It is not a database of contacts, although it contains one. Framing it either way leads to the same failure: the system becomes something people update *for* someone else rather than something they use themselves, and anything maintained out of obligation decays.\n\n### The one test that matters\n\nCan someone who was not in the conversation reconstruct what happened, in under a minute, without asking anybody? If yes, it is working. If no, the rest of the configuration is decoration.`;
  }

  return `Teams evaluating ${kw} usually start from the feature list and work backwards to their own situation. It is worth inverting that. Write down what is actually breaking today — the follow-up that got missed, the report that took an afternoon to assemble, the handover that lost context — and judge each option only on whether it fixes that.\n\nThe gap between the tools in this category is much smaller than the gap between a tool someone owns and one nobody does. Adoption is the variable that decides the outcome, and adoption is mostly a function of how little the tool asks of people during a bad week. Every feature that requires discipline to be useful will be the first thing to lapse.\n\nThat is also why the shortest setup usually wins in practice even when it loses on paper. A tool that is useful on day one gets used on day thirty. One that needs a configuration project first has to compete against every other priority in the business, and it generally loses — not on merit, but on attention.\n\nThe practical implication is that you should weight time-to-value far more heavily than the comparison tables suggest, and weight feature depth far less. Depth you do not use is not a benefit; it is an ongoing cost in complexity, price and onboarding time for every person who joins afterwards.`;
}

/** Minimal markdown → HTML for previews. */
export function mdToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) =>
    esc(s)
      // Links first: a bolded link is written **[text](url)**, and converting
      // emphasis first leaves the link markup stranded inside the <strong>.
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

  const out: string[] = [];
  const lines = md.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        const cells = lines[i].split('|').slice(1, -1).map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
        i++;
      }
      if (rows.length) {
        const [head, ...body] = rows;
        out.push(
          `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>` +
          body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('') +
          `</tbody></table>`,
        );
      }
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s/, '')); i++; }
      out.push(`<ol>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ol>`);
      continue;
    }

    if (/^[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) { items.push(lines[i].replace(/^[-*]\s/, '')); i++; }
      out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`);
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }

    if (line.trim()) { out.push(`<p>${inline(line)}</p>`); i++; continue; }
    i++;
  }
  return out.join('\n');
}
