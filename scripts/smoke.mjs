/**
 * End-to-end check against a running dev server.
 * Everything asserted here is real — crawl data, or a genuine API refusal.
 */
import { PrismaClient } from '@prisma/client';

// Plain node does not read .env, so key checks below would always say "absent".
try { process.loadEnvFile(); } catch { /* no .env, fine */ }

const B = process.env.BASE ?? 'http://[::1]:4330';
const req = (m) => (p, b) =>
  fetch(B + p, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const post = req('POST'); const put = req('PUT'); const del = req('DELETE');

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const db = new PrismaClient();
const site = await db.site.findFirst({ where: { lastCrawlAt: { not: null } }, orderBy: { lastCrawlAt: 'desc' } });
if (!site) { console.log('\nNo crawled site. Run: npm run crawl <url>\n'); process.exit(1); }
const stats = {
  pages: await db.page.count({ where: { siteId: site.id, crawledAt: { not: null } } }),
  issues: await db.auditIssue.count({ where: { siteId: site.id } }),
  ideas: await db.blogIdea.count({ where: { siteId: site.id } }),
  pageId: (await db.page.findFirst({ where: { siteId: site.id, crawledAt: { not: null } } }))?.id,
  // Whether auto-publish should be accepted or refused depends on this.
  hasWordPress: !!(await db.wordPressConnection.findUnique({ where: { siteId: site.id } })),
  hasKeywordMarket: !!(await db.dataForSeoConnection.findUnique({ where: { siteId: site.id } })),
};
await db.$disconnect();

const llmReady = !!(process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY);
console.log(`\nWorkspace: ${site.domain} (${stats.pages} pages, ${stats.issues} findings, ${stats.ideas} ideas)`);
console.log(`WordPress: ${stats.hasWordPress ? 'connected' : 'not connected'}`);
console.log(`LLM key: ${llmReady ? 'present' : 'absent — generation endpoints should refuse cleanly'}\n`);

console.log('Pages');
for (const p of ['/', '/audit', '/pages', '/keywords', '/links', '/ideas', '/calendar', '/studio', '/websites', '/mcp', '/settings', '/connect']) {
  const r = await fetch(B + p);
  check(p, r.status === 200, `${r.status}`);
}
if (stats.pageId) {
  const r = await fetch(`${B}/pages/${stats.pageId}`);
  check('/pages/:id', r.status === 200, `${r.status}`);
}

console.log('\nValidation (Zod)');
let r = await post('/api/connect', { url: 'not a url' });
check('rejects a malformed URL', r.s === 422);
r = await put('/api/ideas', { siteId: site.id, title: 'no' });
check('rejects a too-short title', r.s === 422, r.j.issues?.[0]?.message ?? '');
r = await post('/api/ideas/schedule', { siteId: site.id, ideaId: 'nope', date: 'not-a-date' });
check('rejects a bad schedule date', r.s === 422);
r = await post('/api/blog/publish', { contentId: 'x' });
check('publish requires explicit confirm', r.s === 422);
r = await post('/api/wordpress/connect', { siteId: site.id, baseUrl: 'x', username: '', appPassword: 'short' });
check('rejects bad WordPress credentials shape', r.s === 422);

console.log('\nGeneration guards');
r = await post('/api/ideas', { siteId: site.id, count: 3 });
check(llmReady ? 'idea generation runs' : 'idea generation refuses without a key',
  llmReady ? r.j.ok : r.s === 503, r.j.error ?? (r.j.ok ? `${r.j.data.saved} saved` : ''));
r = await post('/api/blog/generate', { siteId: site.id, ideaId: 'missing' });
check('blog generation rejects an unknown idea', r.s === 503 || r.s === 404);

console.log('\nManual title flow');
const title = `Smoke test title ${Date.now()}`;
r = await put('/api/ideas', { siteId: site.id, title });
check('adds a title by hand', r.s === 201, r.j.data?.title ?? r.j.error);
const ideaId = r.j.data?.id;

if (ideaId) {
  r = await put('/api/ideas', { siteId: site.id, title });
  check('refuses a duplicate title', r.s === 409);

  const when = new Date(Date.now() + 86_400_000).toISOString();
  r = await post('/api/ideas/schedule', { siteId: site.id, ideaId, date: when, autoGenerate: true, autoPublish: false });
  check('schedules it onto the calendar', r.s === 201 || r.s === 200);

  r = await post('/api/ideas/schedule', { siteId: site.id, ideaId, date: when, autoPublish: true });
  check(
    stats.hasWordPress ? 'accepts auto-publish with WordPress connected' : 'refuses auto-publish without WordPress',
    stats.hasWordPress ? r.s === 200 || r.s === 201 : r.s === 409,
    r.j.error ?? '',
  );

  r = await del('/api/ideas/schedule', { ideaId });
  check('unschedules it', r.j.ok === true);

  r = await fetch(`${B}/api/ideas/${ideaId}`, { method: 'DELETE' }).then(async (x) => ({ s: x.status, j: await x.json() }));
  check('dismisses it', r.j.ok === true);
}

console.log('\nKeyword research');
{
  const dfsReady = !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
  const hasMarket = stats.hasKeywordMarket;

  let r = await post('/api/keywords/research', { siteId: site.id, mode: 'seeds', seeds: [], limit: 50 });
  check('research needs a seed keyword', r.s === 422, r.j.issues?.[0]?.message ?? '');

  r = await post('/api/keywords/research', { siteId: site.id, mode: 'site', limit: 50 });
  // Without credentials the route must refuse before spending anything; with
  // them but no market chosen it must say so rather than guess a country.
  const expected = !dfsReady ? 503 : hasMarket ? 201 : 409;
  check(
    !dfsReady ? 'research refuses without credentials' : hasMarket ? 'research runs' : 'research requires a market',
    r.s === expected,
    r.j.error ?? `${r.j.found ?? ''} keywords`,
  );

  r = await fetch(`${B}/api/keywords/locations`).then(async (x) => ({ s: x.status, j: await x.json().catch(() => ({})) }));
  // 403 is the provider refusing an unverified account — a real answer, not a
  // bug here, so the check accepts it and says which one happened.
  const label = !dfsReady ? 'market list refuses without credentials'
    : r.s === 403 ? 'market list blocked — account not verified at the provider'
    : 'market list loads';
  check(label, r.s === (dfsReady ? (r.s === 403 ? 403 : 200) : 503), r.s === 200 ? `${r.j.data?.locations?.length ?? 0} countries` : (r.j.error ?? '').slice(0, 60));
}

console.log('\nScheduler');
r = await post('/api/scheduler/tick', {});
check('cron endpoint runs', r.j.ok === true, r.j.ok ? `checked ${r.j.data.checked} due items` : r.j.error);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
