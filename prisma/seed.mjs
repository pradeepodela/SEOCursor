import { PrismaClient } from '@prisma/client';
import { PRIMARY, SECONDARY, COMPETITORS, PAGES, GHOST_PAGES, KEYWORDS, YEAR, MONTH } from './seed-data.mjs';
import { ISSUES, OPPORTUNITIES, CLUSTERS, STRATEGY, BACKLINKS, RECOMMENDATIONS } from './seed-data2.mjs';
import { CALENDAR, BRIEFS, CONTENT } from './seed-data3.mjs';

const prisma = new PrismaClient();
const d = (day) => new Date(Date.UTC(YEAR, MONTH, day, 9, 0, 0));

// Deterministic pseudo-random so sparklines look organic but stable across reseeds.
function series(points, start, end, jitter) {
  const out = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const base = start + (end - start) * t;
    const wobble = Math.sin(i * 1.7) * jitter + Math.cos(i * 0.9) * jitter * 0.6;
    out.push(Math.max(0, Math.round(base + wobble)));
  }
  return out;
}

async function main() {
  console.log('→ clearing existing data');
  await prisma.$transaction([
    prisma.chatMessage.deleteMany(),
    prisma.calendarItem.deleteMany(),
    prisma.contentPiece.deleteMany(),
    prisma.contentBrief.deleteMany(),
    prisma.opportunity.deleteMany(),
    prisma.auditIssue.deleteMany(),
    prisma.pageRecommendation.deleteMany(),
    prisma.keyword.deleteMany(),
    prisma.page.deleteMany(),
    prisma.backlink.deleteMany(),
    prisma.strategyCluster.deleteMany(),
    prisma.strategy.deleteMany(),
    prisma.metricPoint.deleteMany(),
    prisma.competitor.deleteMany(),
    prisma.site.deleteMany(),
  ]);

  console.log('→ creating sites');
  const site = await prisma.site.create({ data: PRIMARY });
  const site2 = await prisma.site.create({ data: SECONDARY });

  console.log('→ competitors');
  await prisma.competitor.createMany({
    data: COMPETITORS.map((c) => ({ ...c, siteId: site.id })),
  });
  await prisma.competitor.createMany({
    data: [
      { siteId: site2.id, domain: 'billwise.com', name: 'Billwise', label: 'A', color: '#6366f1', organicTraffic: 14200, keywordCount: 980, backlinkCount: 2100, domainRating: 55, contentCount: 190 },
      { siteId: site2.id, domain: 'ledgerly.io', name: 'Ledgerly', label: 'B', color: '#0ea5e9', organicTraffic: 7400, keywordCount: 460, backlinkCount: 890, domainRating: 38, contentCount: 96 },
    ],
  });

  console.log('→ metric history');
  const metricDefs = [
    { metric: 'organic_traffic', start: 9800, end: 12400, jitter: 220 },
    { metric: 'keywords', start: 640, end: 842, jitter: 14 },
    { metric: 'indexed_pages', start: 118, end: 128, jitter: 2 },
    { metric: 'issues', start: 21, end: 12, jitter: 1 },
  ];
  const metricRows = [];
  for (const def of metricDefs) {
    const vals = series(30, def.start, def.end, def.jitter);
    vals.forEach((value, i) => {
      metricRows.push({ siteId: site.id, metric: def.metric, date: d(i - 15), value });
    });
  }
  await prisma.metricPoint.createMany({ data: metricRows });

  console.log('→ pages');
  const pageByUrl = {};
  for (const p of PAGES) {
    const created = await prisma.page.create({ data: { ...p, siteId: site.id } });
    pageByUrl[p.url] = created;
  }
  for (const g of GHOST_PAGES) {
    await prisma.page.create({ data: { ...g, siteId: site.id, indexable: false } });
  }
  await prisma.page.createMany({
    data: [
      { siteId: site2.id, url: '/', title: 'Northwind — Invoicing for freelancers', primaryTopic: 'Invoicing', traffic: 1400, position: 6.2, health: 'GOOD', wordCount: 720 },
      { siteId: site2.id, url: '/pricing', title: 'Pricing | Northwind', primaryTopic: 'Pricing', traffic: 610, position: 8.9, health: 'GOOD', wordCount: 410 },
      { siteId: site2.id, url: '/invoice-templates', title: 'Free Invoice Templates', primaryTopic: 'Templates', traffic: 980, position: 11.4, health: 'NEEDS_WORK', wordCount: 560 },
    ],
  });

  console.log('→ page recommendations');
  for (const [url, recs] of Object.entries(RECOMMENDATIONS)) {
    const page = pageByUrl[url];
    if (!page) continue;
    await prisma.pageRecommendation.createMany({
      data: recs.map((r) => ({ ...r, pageId: page.id })),
    });
  }

  console.log('→ keywords');
  await prisma.keyword.createMany({
    data: KEYWORDS.map(({ page, ...k }) => ({
      ...k,
      siteId: site.id,
      pageId: page ? pageByUrl[page]?.id ?? null : null,
    })),
  });
  await prisma.keyword.createMany({
    data: [
      { siteId: site2.id, keyword: 'free invoice template', volume: 33100, difficulty: 68, cpc: 4.2, intent: 'INFORMATIONAL', position: 11.4, impressions: 12400, clicks: 980, opportunity: 'HIGH' },
      { siteId: site2.id, keyword: 'invoicing software for freelancers', volume: 2900, difficulty: 44, cpc: 11.8, intent: 'COMMERCIAL', position: 6.2, impressions: 5100, clicks: 610, opportunity: 'MEDIUM' },
      { siteId: site2.id, keyword: 'how to invoice a client', volume: 5400, difficulty: 37, cpc: 3.1, intent: 'INFORMATIONAL', position: null, impressions: 800, clicks: 4, opportunity: 'HIGH' },
    ],
  });

  console.log('→ audit issues');
  await prisma.auditIssue.createMany({
    data: ISSUES.map((i) => ({
      ...i,
      siteId: site.id,
      pageId: i.affectedUrl ? pageByUrl[i.affectedUrl]?.id ?? null : null,
    })),
  });

  console.log('→ opportunities');
  const oppByRank = {};
  for (const o of OPPORTUNITIES) {
    const created = await prisma.opportunity.create({ data: { ...o, siteId: site.id } });
    oppByRank[o.rank] = created;
  }

  console.log('→ strategy + clusters');
  await prisma.strategy.create({ data: { ...STRATEGY, siteId: site.id } });
  await prisma.strategyCluster.createMany({
    data: CLUSTERS.map((c) => ({ ...c, siteId: site.id })),
  });

  console.log('→ backlinks');
  await prisma.backlink.createMany({
    data: BACKLINKS.map((b) => ({ ...b, siteId: site.id, firstSeen: d(-Math.floor(Math.random() * 300)) })),
  });

  console.log('→ briefs');
  const briefByKey = {};
  for (const { key, ...b } of BRIEFS) {
    const opp = key === 'startups' ? oppByRank[1] : oppByRank[1];
    const created = await prisma.contentBrief.create({
      data: { ...b, siteId: site.id, opportunityId: key === 'smallbiz' ? oppByRank[1].id : null },
    });
    briefByKey[key] = created;
  }

  console.log('→ content');
  const contentByKey = {};
  for (const c of CONTENT) {
    const { key, briefKey, scheduledDay, publishedDay, ...rest } = c;
    const created = await prisma.contentPiece.create({
      data: {
        ...rest,
        siteId: site.id,
        briefId: briefKey ? briefByKey[briefKey]?.id ?? null : null,
        scheduledFor: scheduledDay ? d(scheduledDay) : null,
        publishedAt: publishedDay ? d(publishedDay) : null,
      },
    });
    contentByKey[key] = created;
  }

  console.log('→ calendar');
  const contentForTitle = {
    'Best CRM for Startups': contentByKey.startups,
    'Best CRM for Small Businesses': contentByKey.smallbiz,
    'CRM vs Spreadsheet': contentByKey.vs,
    'Sales Pipeline Guide': contentByKey.pipeline,
    'CRM implementation': contentByKey.impl,
  };
  await prisma.calendarItem.createMany({
    data: CALENDAR.map((c) => ({
      siteId: site.id,
      date: d(c.day),
      type: c.type,
      title: c.title,
      targetUrl: c.targetUrl,
      status: c.status,
      contentId: contentForTitle[c.title]?.id ?? null,
    })),
  });
  await prisma.calendarItem.createMany({
    data: [
      { siteId: site2.id, date: d(15), type: 'BLOG', title: 'How to invoice a client', status: 'PLANNED' },
      { siteId: site2.id, date: d(22), type: 'UPDATE', title: 'Expand /invoice-templates', status: 'PLANNED' },
    ],
  });

  console.log('→ opportunities for secondary site');
  await prisma.opportunity.createMany({
    data: [
      { siteId: site2.id, rank: 1, title: 'Create "How to invoice a client" guide', subject: 'how to invoice a client', type: 'NEW_CONTENT', impact: 'HIGH', effort: 'LOW', searchVolume: 5400, difficulty: 37, competition: 'Low', currentCoverage: 'None', quickWin: true, recommendedAction: 'Publish a step-by-step guide with a downloadable template.', conclusion: 'CREATE CONTENT — low difficulty, feeds the template page you already rank for.', reasoning: [{ source: 'Keyword data', finding: '5,400 searches/month at difficulty 37.' }, { source: 'Crawler', finding: 'No coverage exists.' }] },
      { siteId: site2.id, rank: 2, title: 'Expand /invoice-templates', subject: '/invoice-templates', type: 'UPDATE_PAGE', impact: 'HIGH', effort: 'LOW', searchVolume: 33100, difficulty: 68, impressions: 12400, competition: 'High', currentCoverage: 'Medium', quickWin: true, actionLabel: 'View Suggestion', recommendedAction: 'Add per-industry template variants and a preview gallery.', conclusion: 'UPDATE PAGE — 12.4K impressions at position 11.4 is the closest win available.', reasoning: [{ source: 'Search Console', finding: '12,400 impressions at average position 11.4.' }] },
    ],
  });

  const counts = {
    sites: await prisma.site.count(),
    pages: await prisma.page.count(),
    keywords: await prisma.keyword.count(),
    issues: await prisma.auditIssue.count(),
    opportunities: await prisma.opportunity.count(),
    calendar: await prisma.calendarItem.count(),
    content: await prisma.contentPiece.count(),
    briefs: await prisma.contentBrief.count(),
    backlinks: await prisma.backlink.count(),
    metrics: await prisma.metricPoint.count(),
  };
  console.log('\n✓ seed complete', counts);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
