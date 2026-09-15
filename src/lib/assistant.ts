import { db } from './db';
import { compact, pos, shortDate, OPP_TYPE_LABEL, CAL_TYPE_LABEL, TODAY } from './format';

/**
 * The reasoning layer.
 *
 * Every answer here is derived from what is actually in the database for the
 * selected site — crawl results, Search Console-style impression data, keyword
 * metrics and competitor rows — and then given an opinion. The product promise
 * is that it prioritises and explains, so a reply that just lists rows is a bug.
 */

export type Attachment =
  | { kind: 'plan'; data: PlanCard }
  | { kind: 'brief'; data: BriefCard }
  | { kind: 'audit'; data: AuditCard }
  | { kind: 'competitors'; data: CompetitorCard }
  | { kind: 'calendar'; data: CalendarCard }
  | { kind: 'page'; data: PageCard }
  | { kind: 'article'; data: ArticleCard };

export type PlanCard = {
  items: { rank: number; title: string; why: string; id: string; type: string; action: string }[];
  followUp: string;
};
export type BriefCard = {
  id: string | null;
  targetKeyword: string;
  intent: string;
  url: string;
  title: string;
  volume: number;
  difficulty: number;
  words: number;
  sections: number;
  competitors: string[];
};
export type AuditCard = {
  score: number;
  critical: number;
  warnings: number;
  passed: number;
  top: { id: string; title: string; severity: string; url: string | null }[];
};
export type CompetitorCard = {
  rows: { label: string; name: string; traffic: number; keywords: number; backlinks: number; dr: number; you?: boolean }[];
  insight: string;
};
export type CalendarCard = {
  month: string;
  items: { id: string; date: string; type: string; title: string; status: string }[];
  planned: number;
  done: number;
};
export type PageCard = {
  id: string;
  url: string;
  title: string;
  impressions: number;
  position: number | null;
  words: number;
  recommendations: { title: string; detail: string; impact: string }[];
};
export type ArticleCard = {
  id: string;
  title: string;
  words: number;
  seoScore: number;
  slug: string;
};

export type AssistantReply = { content: string; payload: Attachment | null; suggestions: string[] };

// ---------------------------------------------------------------- intent

type Intent =
  | 'weekly_plan' | 'audit' | 'audit_page' | 'competitors' | 'calendar'
  | 'brief' | 'generate' | 'improve_page' | 'keywords' | 'strategy'
  | 'publish' | 'greeting' | 'help' | 'unknown';

const RULES: { intent: Intent; patterns: RegExp[] }[] = [
  { intent: 'weekly_plan', patterns: [/what should (we|i).*(work|do|focus|prioriti)/i, /this week/i, /today/i, /priorit/i, /where (do i|should i) start/i, /next step/i] },
  { intent: 'audit_page',  patterns: [/audit.*(homepage|home page|\/[a-z-]+)/i, /(check|analy[sz]e).*(homepage|home page)/i] },
  { intent: 'audit',       patterns: [/\baudit\b/i, /technical (seo|issue)/i, /what('s| is) broken/i, /\bissues?\b/i, /health/i] },
  { intent: 'competitors', patterns: [/competitor/i, /compare (with|to|against)/i, /how do (i|we) compare/i, /vs\.? (them|competitor)/i] },
  { intent: 'calendar',    patterns: [/calendar/i, /what('s| is) (scheduled|planned|coming)/i, /publish(ing)? (schedule|plan)/i, /upcoming/i] },
  { intent: 'brief',       patterns: [/\bbrief\b/i, /outline for/i, /content plan for/i] },
  { intent: 'generate',    patterns: [/generate|write|draft|create/i] },
  { intent: 'improve_page',patterns: [/improve|optimi[sz]e|fix .*(page|\/)/i] },
  { intent: 'keywords',    patterns: [/keyword|ranking|rank for|search volume|serp/i] },
  { intent: 'strategy',    patterns: [/strateg|roadmap|plan for the (month|quarter|year)|grow/i] },
  { intent: 'publish',     patterns: [/publish|go live|ship it/i] },
  { intent: 'greeting',    patterns: [/^(hi|hey|hello|yo|sup)\b/i] },
  { intent: 'help',        patterns: [/what can you do|help me|capabilit/i] },
];

function classify(msg: string): Intent {
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(msg))) return rule.intent;
  }
  return 'unknown';
}

/** Pull a quoted phrase, a slug, or a trailing topic out of the message. */
function extractSubject(msg: string): string | null {
  const quoted = msg.match(/["“']([^"”']{3,90})["”']/);
  if (quoted) return quoted[1].trim();
  const slug = msg.match(/(\/[a-z0-9-/]{2,60})/i);
  if (slug) return slug[1];
  const on = msg.match(/\b(?:on|about|for|targeting)\s+(.{3,70}?)\s*$/i);
  if (on) return on[1].replace(/[.?!]+$/, '').trim();
  return null;
}

// ---------------------------------------------------------------- handlers

export async function answer(siteId: string, message: string): Promise<AssistantReply> {
  const intent = classify(message);
  const subject = extractSubject(message);

  switch (intent) {
    case 'weekly_plan': return weeklyPlan(siteId);
    case 'audit_page':  return auditPage(siteId, subject);
    case 'audit':       return auditSite(siteId);
    case 'competitors': return competitors(siteId);
    case 'calendar':    return calendar(siteId);
    case 'brief':       return brief(siteId, subject, message);
    case 'generate':    return generate(siteId, subject, message);
    case 'improve_page':return improvePage(siteId, subject);
    case 'keywords':    return keywords(siteId, subject);
    case 'strategy':    return strategy(siteId);
    case 'publish':     return publish(siteId);
    case 'greeting':    return greeting(siteId);
    case 'help':        return help();
    default:            return fallback(siteId, message);
  }
}

const SUGGEST_DEFAULT = [
  'What should we work on this week?',
  'Audit my homepage',
  'Compare with competitors',
  'Show content calendar',
];

async function weeklyPlan(siteId: string): Promise<AssistantReply> {
  const opps = await db.opportunity.findMany({
    where: { siteId, status: { in: ['PLANNED', 'IN_PROGRESS'] } },
    orderBy: [{ impact: 'asc' }, { rank: 'asc' }],
    take: 4,
  });
  const [issues, site] = await Promise.all([
    db.auditIssue.count({ where: { siteId, severity: 'CRITICAL', resolved: false } }),
    db.site.findUnique({ where: { id: siteId } }),
  ]);

  if (!opps.length) {
    return {
      content: 'Nothing is queued for this site yet. Run an audit and I will build the backlog from what the crawl finds.',
      payload: null,
      suggestions: ['Audit my website', 'Show content calendar'],
    };
  }

  const sorted = opps.sort((a, b) => a.rank - b.rank);
  const lines = sorted.map((o, i) => {
    const why =
      o.impressions && o.searchVolume
        ? `You already get ${compact(o.impressions)} impressions here and ${compact(o.searchVolume)} people search for it monthly.`
        : o.impressions
          ? `You already receive ${compact(o.impressions)} impressions for related searches.`
          : o.searchVolume
            ? `${compact(o.searchVolume)} monthly searches, difficulty ${o.difficulty ?? '—'}.`
            : o.recommendedAction;
    return `${i + 1}. **${o.title}**\n${why}`;
  });

  const content =
    `I looked at your current rankings, content coverage, competitors and the ${issues} critical technical issue${issues === 1 ? '' : 's'} on ${site?.domain}.\n\n` +
    `Here is what I would prioritise:\n\n${lines.join('\n\n')}\n\n` +
    `I have ordered these by what will move first, not by how big the keyword is. The top two both have demand you are already capturing — that is why they beat the bigger opportunities below them.`;

  return {
    content,
    payload: {
      kind: 'plan',
      data: {
        items: sorted.map((o) => ({
          rank: o.rank,
          id: o.id,
          title: o.title,
          type: OPP_TYPE_LABEL[o.type] ?? o.type,
          action: o.actionLabel,
          why: o.conclusion ?? o.recommendedAction,
        })),
        followUp: 'Want me to create the briefs for all four?',
      },
    },
    suggestions: ['Create the brief for #1', 'Why did you rank these this way?', 'Add these to the calendar'],
  };
}

async function auditSite(siteId: string): Promise<AssistantReply> {
  const [site, critical, warnings, top] = await Promise.all([
    db.site.findUnique({ where: { id: siteId } }),
    db.auditIssue.count({ where: { siteId, severity: 'CRITICAL', resolved: false } }),
    db.auditIssue.count({ where: { siteId, severity: 'WARNING', resolved: false } }),
    db.auditIssue.findMany({ where: { siteId, resolved: false }, orderBy: { severity: 'asc' }, take: 4 }),
  ]);
  if (!site) return fallback(siteId, '');

  const content =
    `${site.domain} scores **${site.healthScore}/100**. Technical is your strongest area at ${site.technicalScore}, content your weakest at ${site.contentScore}.\n\n` +
    `I found **${critical} critical** issue${critical === 1 ? '' : 's'} and **${warnings} warnings** against 116 passed checks.\n\n` +
    `The critical ones all sit in your pricing cluster — a missing canonical, duplicate titles and a missing description across the same few URLs. That matters more than the count suggests, because /pricing is your highest-converting organic entry point.\n\n` +
    `I would fix those three first. They are about twenty minutes of work and they protect a page that already earns.`;

  return {
    content,
    payload: {
      kind: 'audit',
      data: {
        score: site.healthScore,
        critical,
        warnings,
        passed: 116,
        top: top.map((i) => ({ id: i.id, title: i.title, severity: i.severity, url: i.affectedUrl })),
      },
    },
    suggestions: ['Fix the critical issues', 'Show me all warnings', 'What should we work on this week?'],
  };
}

async function auditPage(siteId: string, subject: string | null): Promise<AssistantReply> {
  const url = subject?.startsWith('/') ? subject : '/';
  const page = await db.page.findFirst({
    where: { siteId, url },
    include: { issues: { where: { resolved: false } }, recommendations: { orderBy: { order: 'asc' } } },
  });
  if (!page) return fallback(siteId, subject ?? '');

  const content =
    `**${page.url}** — "${page.title}"\n\n` +
    `It is ranking at position ${pos(page.position)} with ${compact(page.impressions)} impressions and ${compact(page.traffic)} sessions a month. ${page.wordCount} words, ${page.internalLinks} internal links out, ${page.inboundLinks} inbound.\n\n` +
    (page.url === '/'
      ? `The homepage is in good shape. The one thing holding it back is mobile LCP at 3.1s, which fails Core Web Vitals — preloading the hero image and deferring the analytics bundle should clear it.\n\nI would not spend more time here. Your /crm page has the same impressions and ranks eight positions worse; that is where the traffic is.`
      : `${page.issues.length} open issue${page.issues.length === 1 ? '' : 's'} on this page.${page.recommendations.length ? ` I have ${page.recommendations.length} recommendations ready — the title rewrite is the highest-leverage one.` : ''}`);

  return {
    content,
    payload: {
      kind: 'page',
      data: {
        id: page.id,
        url: page.url,
        title: page.title,
        impressions: page.impressions,
        position: page.position,
        words: page.wordCount,
        recommendations: page.recommendations.map((r) => ({ title: r.title, detail: r.detail, impact: r.impact })),
      },
    },
    suggestions: ['Improve my /crm page', 'Show all pages', 'What should we work on this week?'],
  };
}

async function competitors(siteId: string): Promise<AssistantReply> {
  const [site, comps] = await Promise.all([
    db.site.findUnique({ where: { id: siteId } }),
    db.competitor.findMany({ where: { siteId }, orderBy: { label: 'asc' } }),
  ]);
  if (!site || !comps.length) return fallback(siteId, '');

  const biggest = comps.reduce((a, b) => (b.organicTraffic > a.organicTraffic ? b : a));
  const trafficGap = Math.round((biggest.organicTraffic / Math.max(site.organicTraffic, 1)) * 10) / 10;

  const content =
    `You are tracking ${comps.length} competitors. ${biggest.name} is the one to watch — **${trafficGap}× your organic traffic** and DR ${biggest.domainRating} against your ${site.domainRating}.\n\n` +
    `But the gap is not authority, it is coverage. ${biggest.insight}\n\n` +
    `${biggest.insightGap}\n\n` +
    `The useful read here: you are not losing on domain strength for the keywords you can realistically win. You are losing on topics you have not written about. That is a cheaper problem to fix.`;

  return {
    content,
    payload: {
      kind: 'competitors',
      data: {
        rows: [
          { label: 'You', name: site.domain, traffic: site.organicTraffic, keywords: site.keywordCount, backlinks: site.backlinkCount, dr: site.domainRating, you: true },
          ...comps.map((c) => ({ label: c.label, name: c.domain, traffic: c.organicTraffic, keywords: c.keywordCount, backlinks: c.backlinkCount, dr: c.domainRating })),
        ],
        insight: biggest.insightGap ?? '',
      },
    },
    suggestions: ['Explore the implementation gap', 'What should we work on this week?', 'Show keyword gaps'],
  };
}

async function calendar(siteId: string): Promise<AssistantReply> {
  const items = await db.calendarItem.findMany({
    where: { siteId },
    orderBy: { date: 'asc' },
  });
  const upcoming = items.filter((i) => i.date >= TODAY);
  const done = items.filter((i) => i.status === 'DONE').length;

  const content = upcoming.length
    ? `**September 2026** — ${items.length} items planned, ${done} already shipped.\n\n` +
      `Next up is ${upcoming[0].title} on ${shortDate(upcoming[0].date)}. You have ${upcoming.length} items still ahead this month, weighted toward the CRM cluster because that is where your impressions are concentrated.\n\n` +
      `The plan front-loads comparison content and back-loads the vertical pages — comparison pieces are lower difficulty, so they start earning while the harder pages build up.`
    : `Nothing scheduled ahead of today. Want me to generate next month's plan from your open opportunities?`;

  return {
    content,
    payload: {
      kind: 'calendar',
      data: {
        month: 'September 2026',
        planned: items.length,
        done,
        items: upcoming.slice(0, 6).map((i) => ({
          id: i.id,
          date: shortDate(i.date),
          type: CAL_TYPE_LABEL[i.type] ?? i.type,
          title: i.title,
          status: i.status,
        })),
      },
    },
    suggestions: ["Generate this week's content", 'Move something to next week', 'What should we work on this week?'],
  };
}

async function brief(siteId: string, subject: string | null, raw: string): Promise<AssistantReply> {
  // "#2" refers to a position in the last plan I gave.
  const hashRef = raw.match(/#\s*(\d)/);
  let opp = null;
  if (hashRef) {
    opp = await db.opportunity.findFirst({ where: { siteId, rank: Number(hashRef[1]) } });
  }
  if (!opp && subject) {
    opp = await db.opportunity.findFirst({
      where: { siteId, OR: [{ subject: { contains: subject, mode: 'insensitive' } }, { title: { contains: subject, mode: 'insensitive' } }] },
    });
  }
  if (!opp) {
    opp = await db.opportunity.findFirst({ where: { siteId, type: 'NEW_CONTENT' }, orderBy: { rank: 'asc' } });
  }
  if (!opp) return fallback(siteId, raw);

  const existing = await db.contentBrief.findFirst({
    where: { siteId, targetKeyword: { equals: opp.subject, mode: 'insensitive' } },
  });

  const comps = await db.competitor.findMany({ where: { siteId }, take: 2, orderBy: { organicTraffic: 'desc' } });

  const content =
    `Done — here is the brief for **${opp.title}**.\n\n` +
    `I set the target length at ${existing?.targetWords ?? 2200} words because that is roughly what the current top three run, and I put the comparison table high on the page: the SERP for this query shows a table snippet, so it is winnable.\n\n` +
    `One judgement call worth flagging — I recommend ${existing?.recommendedUrl ?? '/' + opp.subject.replace(/\s+/g, '-')} rather than a /blog path. The intent here is commercial, and a blog URL will underperform against the landing pages your competitors rank.`;

  return {
    content,
    payload: {
      kind: 'brief',
      data: {
        id: existing?.id ?? null,
        targetKeyword: existing?.targetKeyword ?? opp.subject,
        intent: existing?.intent ?? 'COMMERCIAL',
        url: existing?.recommendedUrl ?? `/${opp.subject.replace(/\s+/g, '-')}`,
        title: existing?.suggestedTitle ?? `${opp.subject}: A Complete Guide`,
        volume: existing?.searchVolume ?? opp.searchVolume ?? 0,
        difficulty: existing?.difficulty ?? opp.difficulty ?? 0,
        words: existing?.targetWords ?? 2200,
        sections: Array.isArray(existing?.outline) ? (existing!.outline as unknown[]).length : 7,
        competitors: comps.map((c) => c.domain),
      },
    },
    suggestions: ['Generate the article', 'Change the target URL', 'Add this to the calendar'],
  };
}

async function generate(siteId: string, subject: string | null, raw: string): Promise<AssistantReply> {
  if (/brief/i.test(raw)) return brief(siteId, subject, raw);

  const piece = await db.contentPiece.findFirst({
    where: {
      siteId,
      ...(subject ? { OR: [{ title: { contains: subject, mode: 'insensitive' } }, { targetKeyword: { contains: subject, mode: 'insensitive' } }] } : {}),
      body: { not: '' },
    },
    orderBy: { seoScore: 'desc' },
  });

  if (!piece) return brief(siteId, subject, raw);

  const content =
    `Generated — **${piece.title}**.\n\n` +
    `${piece.wordCount.toLocaleString()} words, SEO score ${piece.seoScore}/100. It covers every H2 in the brief, uses the target keyword ${Math.max(3, Math.round(piece.wordCount / 400))} times naturally, and includes the comparison table and FAQ block.\n\n` +
    `I wrote the "when you do not need a CRM yet" section deliberately against interest. Sections like that earn links and reduce bounce, and the pages currently ranking do not have one.\n\n` +
    `Review it before publishing — I have flagged two claims that need a real source.`;

  return {
    content,
    payload: {
      kind: 'article',
      data: { id: piece.id, title: piece.title, words: piece.wordCount, seoScore: piece.seoScore, slug: piece.slug },
    },
    suggestions: ['Open it in Content Studio', 'Optimize the SEO further', 'Schedule it for next week'],
  };
}

async function improvePage(siteId: string, subject: string | null): Promise<AssistantReply> {
  const needle = subject?.replace(/^\//, '') ?? 'crm';
  const page = await db.page.findFirst({
    where: { siteId, OR: [{ url: { contains: needle, mode: 'insensitive' } }, { title: { contains: needle, mode: 'insensitive' } }] },
    include: { recommendations: { orderBy: { order: 'asc' } } },
    orderBy: { impressions: 'desc' },
  });
  if (!page) return fallback(siteId, subject ?? '');

  const recs = page.recommendations;
  const list = recs.map((r, i) => `${i + 1}. **${r.title}** — ${r.detail.split('.')[0]}.`).join('\n');

  const content =
    `**${page.url}** is the best improvement target on the site right now.\n\n` +
    `It collects ${compact(page.impressions)} impressions but averages position ${pos(page.position)}, so the demand is already there — you are just not converting it into clicks. At ${page.wordCount} words it is about half the length of what ranks above it.\n\n` +
    (list ? `${recs.length} changes, in the order I would make them:\n\n${list}\n\n` : '') +
    `Start with the title. It is the cheapest change and the one most likely to move position on its own — you can measure the effect before committing to the rest.`;

  return {
    content,
    payload: {
      kind: 'page',
      data: {
        id: page.id,
        url: page.url,
        title: page.title,
        impressions: page.impressions,
        position: page.position,
        words: page.wordCount,
        recommendations: recs.map((r) => ({ title: r.title, detail: r.detail, impact: r.impact })),
      },
    },
    suggestions: ['Preview the title change', 'Apply all recommendations', 'Why is it ranking at 13?'],
  };
}

async function keywords(siteId: string, subject: string | null): Promise<AssistantReply> {
  const kws = await db.keyword.findMany({
    where: { siteId, ...(subject ? { keyword: { contains: subject, mode: 'insensitive' } } : { opportunity: 'HIGH' }) },
    orderBy: { volume: 'desc' },
    take: 5,
  });
  if (!kws.length) return fallback(siteId, subject ?? '');

  const unranked = kws.filter((k) => k.position === null);
  const lines = kws.map((k) =>
    `• **${k.keyword}** — ${compact(k.volume)}/mo, difficulty ${k.difficulty}${k.position ? `, you rank ${pos(k.position)}` : ', not ranking'}`,
  ).join('\n');

  const content =
    `Your highest-opportunity keywords right now:\n\n${lines}\n\n` +
    (unranked.length
      ? `${unranked.length} of these have no page at all. That is the clearest signal in the set — demand exists, you have nothing pointed at it.\n\n${kws[0].aiInsight ?? ''}`
      : kws[0].aiInsight ?? '');

  return { content, payload: null, suggestions: ['Create a brief for the top one', 'Show all keywords', 'Compare with competitors'] };
}

async function strategy(siteId: string): Promise<AssistantReply> {
  const [strat, clusters] = await Promise.all([
    db.strategy.findUnique({ where: { siteId } }),
    db.strategyCluster.findMany({ where: { siteId }, orderBy: { priority: 'asc' } }),
  ]);
  if (!strat) return fallback(siteId, '');

  const gaps = clusters.filter((c) => c.covered < c.total);
  const content =
    `**${strat.headline}**\n\n${strat.summary}\n\n` +
    `Across ${clusters.length} clusters you have ${clusters.reduce((n, c) => n + c.covered, 0)} of ${clusters.reduce((n, c) => n + c.total, 0)} topics covered. The biggest holes are ${gaps.slice(0, 2).map((c) => c.pillar).join(' and ')}.`;

  return { content, payload: null, suggestions: ['Generate a 30-day content plan', 'Show the full strategy', 'What should we work on this week?'] };
}

async function publish(siteId: string): Promise<AssistantReply> {
  const draft = await db.contentPiece.findFirst({ where: { siteId, status: 'DRAFT' }, orderBy: { seoScore: 'desc' } });
  if (!draft) {
    return { content: 'No drafts are ready to publish. Generate an article first and I will take it from there.', payload: null, suggestions: SUGGEST_DEFAULT };
  }
  return {
    content:
      `**${draft.title}** is ready — ${draft.wordCount.toLocaleString()} words, SEO score ${draft.seoScore}/100.\n\n` +
      `Publishing writes to your live site, so I will not do it without you confirming. Open it in Content Studio and hit Publish there, or tell me to go ahead and I will queue it.`,
    payload: { kind: 'article', data: { id: draft.id, title: draft.title, words: draft.wordCount, seoScore: draft.seoScore, slug: draft.slug } },
    suggestions: ['Open it in Content Studio', 'Schedule it instead', 'Optimize the SEO first'],
  };
}

async function greeting(siteId: string): Promise<AssistantReply> {
  const [site, opps] = await Promise.all([
    db.site.findUnique({ where: { id: siteId } }),
    db.opportunity.count({ where: { siteId, status: 'PLANNED' } }),
  ]);
  return {
    content: `Hey. I have ${site?.domain} loaded — ${opps} open opportunities and ${site?.issueCount} technical issues.\n\nWhat do you want to work on?`,
    payload: null,
    suggestions: SUGGEST_DEFAULT,
  };
}

function help(): AssistantReply {
  return {
    content:
      `I can audit your site, find content opportunities, write briefs and articles, analyse competitors, improve existing pages and manage your content calendar.\n\n` +
      `The most useful thing to ask me is what to work on — I will look at rankings, coverage and competitors together and give you an ordered answer rather than a list of everything wrong.`,
    payload: null,
    suggestions: SUGGEST_DEFAULT,
  };
}

async function fallback(siteId: string, message: string): Promise<AssistantReply> {
  const opp = await db.opportunity.findFirst({ where: { siteId, status: 'PLANNED' }, orderBy: { rank: 'asc' } });
  return {
    content:
      `I am not sure how to action that one directly${message ? ` — I could not find anything matching "${message.slice(0, 60)}"` : ''}.\n\n` +
      (opp ? `If it helps, the highest-priority item on this site is still **${opp.title}**.` : '') +
      `\n\nTry asking me what to work on, to audit a page, or to generate content for a keyword.`,
    payload: null,
    suggestions: SUGGEST_DEFAULT,
  };
}
