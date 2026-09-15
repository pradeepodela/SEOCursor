/** Fetch each live screen for a given domain and report what rendered. */
import { PrismaClient } from '@prisma/client';
const B = process.env.BASE ?? 'http://[::1]:4330';
const domain = process.argv[2] ?? 'astro.build';

const db = new PrismaClient();
const site = await db.site.findUnique({ where: { domain } });
await db.$disconnect();
if (!site) { console.log(`${domain} is not in the database`); process.exit(1); }

console.log(`\n${domain}\n`);
for (const p of ['/', '/audit', '/pages', '/links', '/keywords', '/ideas', '/calendar', '/studio', '/settings']) {
  const url = `${B}${p}${p.includes('?') ? '&' : '?'}site=${site.id}`;
  const r = await fetch(url);
  const t = await r.text();
  const empty = /Nothing here|No link data yet|Nothing crawled yet|Needs Search Console|Keyword data comes from Google/.test(t);
  const rows = (t.match(/<tr /g) ?? []).length;
  console.log(`  ${p.padEnd(22)} ${r.status}  ${String(t.length).padStart(7)}b  ${String(rows).padStart(4)} rows  ${empty ? 'shows an honest empty state' : ''}`);
}
console.log();
