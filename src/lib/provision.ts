import { db } from './db';
import { defaultModels } from './llm';

/**
 * Register a website. Nothing here invents data — the row starts empty and the
 * crawl fills it in. Competitors are recorded as domains to compare against
 * once we have crawl or Search Console data for them.
 */

const EMOJI = ['🟦', '🟩', '🟨', '🟧', '🟪', '🟥', '🔷', '🔶'];
const COLORS = ['#6366f1', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899'];

const hostOf = (u: string) => new URL(u).hostname.replace(/^www\./, '');

export async function provisionSite(url: string, competitorUrls: string[], maxPages = 150) {
  const domain = hostOf(url);
  const brand = domain.split('.')[0];
  const name = brand.charAt(0).toUpperCase() + brand.slice(1);

  const existing = await db.site.findUnique({ where: { domain } });
  const site = existing
    ? await db.site.update({ where: { id: existing.id }, data: { url, crawlPageCap: maxPages } })
    : await db.site.create({
        data: {
          domain,
          url,
          name,
          emoji: EMOJI[domain.length % EMOJI.length],
          isPrimary: (await db.site.count()) === 0,
          crawlPageCap: maxPages,
          // Chosen from the providers that have a key, not from a static
          // schema default that may name one the user never configured.
          ...defaultModels(),
        },
      });

  // Competitors are just tracked domains until we have data on them.
  const wanted = competitorUrls.slice(0, 5).map(hostOf);
  for (const [i, cd] of wanted.entries()) {
    if (cd === domain) continue;
    const cbrand = cd.split('.')[0];
    await db.competitor.upsert({
      where: { siteId_domain: { siteId: site.id, domain: cd } },
      update: {},
      create: {
        siteId: site.id,
        domain: cd,
        name: cbrand.charAt(0).toUpperCase() + cbrand.slice(1),
        label: String.fromCharCode(65 + i),
        color: COLORS[i % COLORS.length],
      },
    });
  }

  return site;
}
