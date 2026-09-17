/**
 * Smoke-test the MCP server over stdio.
 *
 * Speaks raw JSON-RPC at `bin/seo-mcp.mjs` the way a host does, so this proves
 * the handshake, the tool list, the `ui://` resources and a real tool call
 * against the live database — not that the modules merely import.
 *
 *   node scripts/mcp-check.mjs
 */

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UI_MIME = 'text/html;profile=mcp-app';

const child = spawn('node', [resolve(root, 'bin/seo-mcp.mjs')], {
  cwd: root,
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stderr = '';
child.stderr.on('data', (d) => { stderr += d.toString(); });

/** Pending requests by id, plus a buffer for partial lines. */
const pending = new Map();
let buffer = '';

child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  let nl;
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      fail(`Server wrote a non-JSON line to stdout — that corrupts the transport:\n  ${line.slice(0, 200)}`);
    }
    const waiter = pending.get(msg.id);
    if (waiter) {
      pending.delete(msg.id);
      waiter(msg);
    }
  }
});

let nextId = 1;

function send(method, params) {
  const id = nextId++;
  return new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`${method} timed out after 60s`)), 60_000);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      res(msg);
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

function notify(method, params) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
}

const checks = [];
const record = (ok, label, detail = '') => {
  checks.push({ ok, label, detail });
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

function fail(message) {
  console.error(`\n${message}\n${stderr ? `--- server stderr ---\n${stderr}` : ''}`);
  child.kill();
  process.exit(1);
}

try {
  // ------------------------------------------------------------- handshake
  // Advertise MCP Apps support the way a UI-capable host does.
  const init = await send('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {
      extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [UI_MIME] } },
    },
    clientInfo: { name: 'mcp-check', version: '1.0.0' },
  });

  if (init.error) fail(`initialize failed: ${JSON.stringify(init.error)}`);
  record(true, 'initialize', `${init.result.serverInfo.name} v${init.result.serverInfo.version}`);
  record(!!init.result.instructions, 'server sends instructions');

  notify('notifications/initialized');

  // ------------------------------------------------------------- tools
  const tools = await send('tools/list', {});
  if (tools.error) fail(`tools/list failed: ${JSON.stringify(tools.error)}`);
  const list = tools.result.tools;
  record(list.length > 0, 'tools/list', `${list.length} tools`);

  // Every tool must carry a description and an input schema, or an agent is
  // guessing at how to call it.
  const undescribed = list.filter((t) => !t.description);
  record(undescribed.length === 0, 'every tool is described', undescribed.map((t) => t.name).join(', '));

  const noSchema = list.filter((t) => !t.inputSchema);
  record(noSchema.length === 0, 'every tool has an input schema', noSchema.map((t) => t.name).join(', '));

  // ------------------------------------------------------------- app wiring
  const withUi = list.filter((t) => t._meta?.ui?.resourceUri || t._meta?.['ui/resourceUri']);
  record(withUi.length > 0, 'tools declare UI resources', withUi.map((t) => t.name).join(', '));

  const resources = await send('resources/list', {});
  if (resources.error) fail(`resources/list failed: ${JSON.stringify(resources.error)}`);
  const uris = new Set(resources.result.resources.map((r) => r.uri));
  record(resources.result.resources.length > 0, 'resources/list', `${resources.result.resources.length} resources`);

  // The contract that actually breaks in practice: a tool pointing at a view
  // that was never registered renders as a blank panel with no error.
  const dangling = withUi
    .map((t) => t._meta?.ui?.resourceUri ?? t._meta?.['ui/resourceUri'])
    .filter((uri) => !uris.has(uri));
  record(dangling.length === 0, 'every tool UI resource exists', dangling.join(', '));

  // ------------------------------------------------------------- read a view
  const uiUri = withUi[0]?._meta?.ui?.resourceUri ?? withUi[0]?._meta?.['ui/resourceUri'];
  const view = await send('resources/read', { uri: uiUri });
  if (view.error) fail(`resources/read ${uiUri} failed: ${JSON.stringify(view.error)}`);
  const content = view.result.contents[0];
  record(content.mimeType === UI_MIME, 'view uses the MCP Apps mime type', content.mimeType);
  record(/<div id="root">/.test(content.text), 'view HTML has a mount point');
  record(
    !/<script[^>]+src=/.test(content.text) && !/<link[^>]+stylesheet/.test(content.text),
    'view is self-contained (no external script/style)',
    `${(content.text.length / 1024).toFixed(0)} KB`,
  );

  // ------------------------------------------------------------- call a tool
  const call = await send('tools/call', { name: 'list_sites', arguments: {} });
  if (call.error) fail(`tools/call list_sites failed: ${JSON.stringify(call.error)}`);
  const text = call.result.content?.[0]?.text ?? '';
  record(!!text, 'tools/call list_sites returns text', text.split('\n')[0]?.slice(0, 80));

  // A tool backed by a view must return structured data too, or the view has
  // nothing to render.
  const audit = await send('tools/call', { name: 'audit_site', arguments: {} });
  if (audit.error) fail(`tools/call audit_site failed: ${JSON.stringify(audit.error)}`);
  if (audit.result.isError) {
    // A workspace with no crawled site is a legitimate state; the tool should
    // explain itself rather than throw.
    record(true, 'audit_site reports its precondition', audit.result.content[0].text.slice(0, 90));
  } else {
    record(!!audit.result.structuredContent, 'audit_site returns structuredContent for its view');
    record(!!audit.result.content?.[0]?.text, 'audit_site also returns text for clients with no UI');
  }

  // ------------------------------------------------------------- bad input
  const bad = await send('tools/call', { name: 'get_page', arguments: {} });
  record(!!bad.error || bad.result?.isError, 'missing required argument is rejected');

  // ------------------------------------------------------------- no drift
  // `src/lib/mcp.ts` is what the /mcp page and the manifest endpoint publish.
  // If it and the server disagree, one of them is lying to whoever reads it.
  const manifest = await readFile(resolve(root, 'src/lib/mcp.ts'), 'utf8');
  const documented = new Set([...manifest.matchAll(/name:\s*'([a-z_]+)',\s*group:/g)].map((m) => m[1]));
  const served = new Set(list.map((t) => t.name));

  const undocumented = [...served].filter((n) => !documented.has(n));
  record(undocumented.length === 0, 'every served tool is in the published manifest', undocumented.join(', '));

  const phantom = [...documented].filter((n) => !served.has(n));
  record(phantom.length === 0, 'the manifest advertises no tool the server lacks', phantom.join(', '));

  // Same for the app views, which the page lists separately.
  const documentedApps = new Set([...manifest.matchAll(/uri:\s*'(ui:\/\/[^']+)'/g)].map((m) => m[1]));
  const servedApps = new Set(
    withUi.map((t) => t._meta?.ui?.resourceUri ?? t._meta?.['ui/resourceUri']),
  );
  const appDrift = [...servedApps].filter((u) => !documentedApps.has(u));
  record(appDrift.length === 0, 'every app view is in the published manifest', appDrift.join(', '));
} catch (e) {
  fail(e.stack ?? e.message);
}

child.kill();

const failed = checks.filter((c) => !c.ok);
console.log(
  `\n${checks.length - failed.length}/${checks.length} checks passed` + (failed.length ? ' — see FAIL above' : ''),
);
if (stderr.trim()) console.log(`\n--- server stderr ---\n${stderr.trim()}`);
process.exit(failed.length ? 1 : 0);
