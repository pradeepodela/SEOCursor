/**
 * Build the MCP surface: the App views, and the stdio binary.
 *
 * Each view ships as one file with the JavaScript and CSS inlined and React
 * bundled in. That is not an optimisation, it is the only thing that works: an
 * MCP App runs in a sandboxed iframe with no same-origin server and a default
 * CSP of `default-src 'none'`, so a `<script src>` to a CDN or a stylesheet
 * link would be blocked with no visible error — the panel would simply render
 * blank. Everything the view needs has to be in the document.
 *
 * The stdio binary is bundled for a different reason: a desktop MCP client
 * spawns it as a bare `node` process, and the TypeScript sources import each
 * other without file extensions, which plain node ESM will not resolve.
 *
 *   node scripts/build-mcp.mjs [--watch]
 */

import { build, context } from 'esbuild';
import { mkdir, writeFile, readFile, chmod } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appsDir = resolve(root, 'src/mcp/apps');
const outDir = resolve(appsDir, 'dist');

/** Read the catalogue from the same file the server reads. */
async function loadApps() {
  const src = await readFile(resolve(appsDir, 'registry.ts'), 'utf8');
  const apps = [];
  // The registry is plain data; parsing it beats importing TypeScript from a
  // plain node script just to read four string literals.
  const re = /\{\s*key:\s*'([^']+)',[\s\S]*?entry:\s*'([^']+)',?\s*\}/g;
  for (const m of src.matchAll(re)) apps.push({ key: m[1], entry: m[2] });
  if (!apps.length) throw new Error('No apps found in src/mcp/apps/registry.ts');
  return apps;
}

const escapeForScript = (js) =>
  // A literal `</script>` inside the bundle would close the tag early. This is
  // the only escaping the inline script needs.
  js.replaceAll('</script', '<\\/script');

function html({ key, js, css }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SEO Cursor — ${key}</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${escapeForScript(js)}</script>
</body>
</html>
`;
}

const options = (apps) => ({
  entryPoints: apps.map((a) => resolve(appsDir, a.entry)),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  minify: true,
  write: false,
  outdir: outDir,
  logLevel: 'silent',
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.css': 'css' },
});

/** Pair each entry's JS and CSS output and write one HTML file per view. */
async function emit(apps, result) {
  await mkdir(outDir, { recursive: true });

  const byKey = new Map(apps.map((a) => [a.key, { js: '', css: '' }]));
  for (const file of result.outputFiles) {
    const m = /([^/\\]+)\.(js|css)$/.exec(file.path);
    if (!m) continue;
    const slot = byKey.get(m[1]);
    if (slot) slot[m[2]] = file.text;
  }

  const written = [];
  for (const app of apps) {
    const { js, css } = byKey.get(app.key);
    if (!js) throw new Error(`No JavaScript was emitted for "${app.key}"`);
    const out = resolve(outDir, `${app.key}.html`);
    const doc = html({ key: app.key, js, css });
    await writeFile(out, doc, 'utf8');
    written.push({ key: app.key, bytes: Buffer.byteLength(doc) });
  }
  return written;
}

/**
 * Bundle the stdio entry point to `bin/seo-mcp.mjs`.
 *
 * Prisma, Crawlee and Playwright stay external: they load native binaries and
 * generated clients from their own package directories, and bundling them
 * breaks those lookups. They resolve from node_modules at runtime, which is
 * where they already are.
 */
async function buildStdio() {
  const out = resolve(root, 'bin/seo-mcp.mjs');
  await mkdir(resolve(root, 'bin'), { recursive: true });

  const result = await build({
    entryPoints: [resolve(root, 'src/mcp/stdio.ts')],
    outfile: out,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: ['node20'],
    banner: { js: '#!/usr/bin/env node' },
    external: ['@prisma/client', 'prisma', 'crawlee', '@crawlee/*', 'playwright', 'cheerio'],
    logLevel: 'silent',
  });

  if (result.errors.length) {
    console.error(result.errors.map((e) => e.text).join('\n'));
    process.exit(1);
  }

  await chmod(out, 0o755);
  console.log('[mcp] built bin/seo-mcp.mjs');
}

const apps = await loadApps();
const watch = process.argv.includes('--watch');

if (watch) {
  const ctx = await context({
    ...options(apps),
    plugins: [
      {
        name: 'emit-html',
        setup(b) {
          b.onEnd(async (result) => {
            if (result.errors.length) {
              console.error(`[mcp] build failed:\n${result.errors.map((e) => e.text).join('\n')}`);
              return;
            }
            const written = await emit(apps, result);
            console.log(`[mcp] rebuilt ${written.map((w) => w.key).join(', ')}`);
          });
        },
      },
    ],
  });
  await ctx.watch();
  console.log('[mcp] watching for changes…');
} else {
  const result = await build(options(apps));
  if (result.errors.length) {
    console.error(result.errors.map((e) => e.text).join('\n'));
    process.exit(1);
  }
  const written = await emit(apps, result);
  for (const w of written) console.log(`  ${w.key}.html  ${(w.bytes / 1024).toFixed(0)} KB`);
  console.log(`[mcp] built ${written.length} views into src/mcp/apps/dist`);

  await buildStdio();
}
