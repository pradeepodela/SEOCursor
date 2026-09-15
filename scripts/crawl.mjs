/**
 * Crawl a site from the command line, straight through the real crawler.
 *
 *   node scripts/crawl.mjs https://example.com [maxPages]
 *
 * Creates the Site row if it does not exist, runs the crawl, prints findings.
 */
import { build } from 'esbuild';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const target = process.argv[2];
const cap = Number(process.argv[3] ?? 25);
if (!target) { console.error('usage: node scripts/crawl.mjs <url> [maxPages]'); process.exit(1); }

const url = /^https?:\/\//.test(target) ? target : `https://${target}`;
const domain = new URL(url).hostname.replace(/^www\./, '');

const db = new PrismaClient();

let site = await db.site.findUnique({ where: { domain } });
if (!site) {
  site = await db.site.create({
    data: { domain, url, name: domain.split('.')[0], crawlPageCap: cap },
  });
  console.log(`created site ${domain}`);
} else {
  await db.site.update({ where: { id: site.id }, data: { crawlPageCap: cap } });
}

const job = await db.crawlJob.create({ data: { siteId: site.id, maxPages: cap } });

// Bundle the TS crawler so plain node can run it.
const out = join(process.cwd(), 'node_modules', '.crawl-entry.mjs');
await build({
  entryPoints: [join(process.cwd(), 'src/lib/crawler/crawl.ts')],
  bundle: true, platform: 'node', format: 'esm', outfile: out,
  packages: 'external', target: 'node20', logLevel: 'error',
});
const { runCrawl } = await import(out + '?t=' + Date.now());

const started = Date.now();
const tick = setInterval(async () => {
  const j = await db.crawlJob.findUnique({ where: { id: job.id } });
  if (j) process.stdout.write(`\r  ${j.phase.padEnd(46)}`);
}, 700);

try {
  await runCrawl(site.id, job.id);
} catch (e) {
  clearInterval(tick);
  console.error('\ncrawl failed:', e.message);
  process.exit(1);
}
clearInterval(tick);

const secs = ((Date.now() - started) / 1000).toFixed(1);
const [pages, links, issues, fresh] = await Promise.all([
  db.page.findMany({ where: { siteId: site.id }, orderBy: { depth: 'asc' } }),
  db.link.findMany({ where: { siteId: site.id } }),
  db.auditIssue.findMany({ where: { siteId: site.id, fromCrawl: true }, orderBy: [{ severity: 'asc' }, { affectedCount: 'desc' }] }),
  db.site.findUnique({ where: { id: site.id } }),
]);

const checked = links.filter((l) => l.checkedAt);
console.log(`\r${' '.repeat(50)}\r`);
console.log(`✓ crawled ${domain} in ${secs}s\n`);
console.log(`  pages        ${pages.length}`);
console.log(`  links found  ${links.length} (${checked.length} checked, ${checked.filter((l) => !l.ok).length} broken)`);
console.log(`  sitemap      ${fresh.sitemapUrls.length ? fresh.sitemapUrls.join(', ') : 'none found'}`);
console.log(`  robots.txt   ${fresh.robotsTxtUrl ?? 'none found'}`);
console.log(`  engine       ${fresh.renderMode === 'browser' ? 'headless browser (client-rendered site)' : 'HTTP (server-rendered)'}`);
console.log(`\n  health ${fresh.healthScore}  ·  technical ${fresh.technicalScore}  ·  on-page ${fresh.onPageScore}  ·  content ${fresh.contentScore}  ·  ux ${fresh.uxScore}\n`);

console.log('Pages');
for (const p of pages.slice(0, 12)) {
  console.log(`  ${String(p.statusCode ?? '—').padEnd(4)} d${p.depth} ${p.url.slice(0, 44).padEnd(45)} ${String(p.wordCount).padStart(5)}w  ${String(p.inboundLinks).padStart(3)}in  ${p.responseMs}ms`);
}
if (pages.length > 12) console.log(`  … and ${pages.length - 12} more`);

console.log(`\nFindings (${issues.length})`);
for (const i of issues) {
  const tag = i.severity === 'CRITICAL' ? '!!' : ' ·';
  console.log(`  ${tag} [${i.category}] ${i.title}`);
  if (i.samples.length) console.log(`       ${i.samples[0].slice(0, 96)}`);
}

const broken = checked.filter((l) => !l.ok);
if (broken.length) {
  console.log(`\nBroken links (${broken.length})`);
  for (const b of broken.slice(0, 10)) {
    console.log(`  ${String(b.statusCode ?? b.error ?? '?').padEnd(8)} ${b.toUrl.slice(0, 60)}`);
    console.log(`           from ${b.fromUrl.slice(0, 66)}`);
  }
}

await db.$disconnect();
