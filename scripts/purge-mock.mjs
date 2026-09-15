/**
 * Remove every fabricated row. After this the database contains only what a
 * crawl or a connected Google account actually produced.
 */
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const counts = {};
const wipe = async (name, fn) => { counts[name] = (await fn()).count; };

// Anything not observed by a crawl is fabricated.
await wipe('chatMessages', () => db.chatMessage.deleteMany());
await wipe('calendarItems', () => db.calendarItem.deleteMany());
await wipe('contentPieces', () => db.contentPiece.deleteMany());
await wipe('contentBriefs', () => db.contentBrief.deleteMany());
await wipe('opportunities', () => db.opportunity.deleteMany());
await wipe('pageRecommendations', () => db.pageRecommendation.deleteMany());
await wipe('mockIssues', () => db.auditIssue.deleteMany({ where: { fromCrawl: false } }));
await wipe('keywords', () => db.keyword.deleteMany());
await wipe('mockPages', () => db.page.deleteMany({ where: { crawledAt: null } }));
await wipe('backlinks', () => db.backlink.deleteMany());
await wipe('strategyClusters', () => db.strategyCluster.deleteMany());
await wipe('strategies', () => db.strategy.deleteMany());
await wipe('metricPoints', () => db.metricPoint.deleteMany());
await wipe('competitors', () => db.competitor.deleteMany());

// Reset invented headline numbers on every site.
const { count: sites } = await db.site.updateMany({
  data: {
    organicTraffic: 0, trafficDelta: 0,
    keywordCount: 0, keywordDelta: 0,
    pagesDelta: 0, issueDelta: 0,
    backlinkCount: 0, backlinkScore: 0, domainRating: 0,
  },
});
counts.sitesReset = sites;

// Drop any site that has never been crawled.
const { count: dropped } = await db.site.deleteMany({ where: { lastCrawlAt: null } });
counts.uncrawledSitesDropped = dropped;

console.log('purged:', counts);
const remaining = {
  sites: await db.site.count(),
  pages: await db.page.count(),
  issues: await db.auditIssue.count(),
  links: await db.link.count(),
};
console.log('remaining (all crawl-derived):', remaining);
await db.$disconnect();
