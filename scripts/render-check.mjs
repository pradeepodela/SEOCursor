/** Does this site need a browser, and what difference does it make? */
import { build } from 'esbuild';
import { join } from 'node:path';

const target = process.argv[2];
if (!target) { console.error('usage: node scripts/render-check.mjs <url>'); process.exit(1); }
const url = /^https?:\/\//.test(target) ? target : `https://${target}`;

const out = join(process.cwd(), 'node_modules', '.render-entry.mjs');
await build({
  entryPoints: [join(process.cwd(), 'src/lib/crawler/render.ts')],
  bundle: true, platform: 'node', format: 'esm', outfile: out,
  packages: 'external', target: 'node20', logLevel: 'error',
});
const { pickRenderMode, browserAvailable } = await import(out + '?t=' + Date.now());

const pOut = join(process.cwd(), 'node_modules', '.parse-entry.mjs');
await build({
  entryPoints: [join(process.cwd(), 'src/lib/crawler/parse.ts')],
  bundle: true, platform: 'node', format: 'esm', outfile: pOut,
  packages: 'external', target: 'node20', logLevel: 'error',
});
const { parseHtml } = await import(pOut + '?t=' + Date.now());

console.log('browser available:', await browserAvailable());
const mode = await pickRenderMode(url);
console.log('detected render mode:', mode);

// Raw HTTP view
const raw = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; SEOCursorBot/0.1)' } }).then(r => r.text());
const httpView = parseHtml(raw, url);
console.log(`\nHTTP fetch      → ${httpView.wordCount} words · ${httpView.h1s.length} H1 · ${httpView.links.length} links · title ${JSON.stringify(httpView.title.slice(0,40))}`);

// Browser view
const pw = await import('playwright');
const b = await pw.chromium.launch({ headless: true });
const pg = await b.newPage({ userAgent: 'Mozilla/5.0 (compatible; SEOCursorBot/0.1)' });
await pg.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
const rendered = await pg.content();
await b.close();
const browserView = parseHtml(rendered, url);
console.log(`Browser render  → ${browserView.wordCount} words · ${browserView.h1s.length} H1 · ${browserView.links.length} links · title ${JSON.stringify(browserView.title.slice(0,40))}`);

const delta = browserView.wordCount - httpView.wordCount;
console.log(`\ndifference: ${delta > 0 ? '+' : ''}${delta} words, ${browserView.links.length - httpView.links.length >= 0 ? '+' : ''}${browserView.links.length - httpView.links.length} links`);
if (mode === 'browser') console.log('→ a plain HTTP crawl would have under-reported this site.');
else console.log('→ server-rendered; the HTTP crawler sees everything.');
