/**
 * Verify a deployed instance, from outside.
 *
 * Checks the things that actually break between "the build went green" and
 * "the thing works": whether the server is up, whether the MCP endpoint is
 * reachable and guarded, whether the ui:// views made it into the image, and
 * whether the database is attached.
 *
 *   MCP_TOKEN=... node scripts/deploy-check.mjs https://your-app.up.railway.app
 */

const base = (process.argv[2] ?? process.env.DEPLOY_URL ?? '').replace(/\/+$/, '');
const token = process.env.MCP_TOKEN?.trim();

if (!base) {
  console.error('Usage: MCP_TOKEN=... node scripts/deploy-check.mjs https://your-app.up.railway.app');
  process.exit(1);
}

const checks = [];
const record = (ok, label, detail = '') => {
  checks.push({ ok, label });
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

const mcpHeaders = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  ...(token ? { authorization: `Bearer ${token}` } : {}),
};

/** The transport answers as SSE or plain JSON depending on the exchange. */
async function rpc(method, params, headers = mcpHeaders) {
  const res = await fetch(`${base}/api/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  const text = await res.text();
  const line = text.split('\n').find((l) => l.trim().startsWith('{') || l.startsWith('data: {'));
  let body = null;
  try {
    body = line ? JSON.parse(line.replace(/^data:\s*/, '')) : null;
  } catch {
    /* leave null — the status still tells us something */
  }
  return { status: res.status, body };
}

try {
  // -------------------------------------------------------------- reachable
  const manifest = await fetch(`${base}/api/mcp/manifest`);
  record(manifest.ok, 'server is up', `GET /api/mcp/manifest -> ${manifest.status}`);
  if (!manifest.ok) {
    console.error('\nNothing else can be checked while the server is down.');
    process.exit(1);
  }

  // -------------------------------------------------------------- guarded
  // An unauthenticated MCP endpoint is a stranger's crawl budget and byline,
  // so this is the check worth caring about.
  const open = await rpc(
    'initialize',
    { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'deploy-check', version: '1' } },
    { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
  );
  record(
    open.status === 401 || open.status === 503,
    'MCP endpoint rejects unauthenticated calls',
    open.status === 200 ? 'SERVED WITHOUT A TOKEN — set MCP_TOKEN now' : `-> ${open.status}`,
  );

  if (!token) {
    console.log('\n  (MCP_TOKEN not set locally — skipping the authenticated checks.)');
  } else {
    // ------------------------------------------------------------ handshake
    const init = await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } },
      clientInfo: { name: 'deploy-check', version: '1' },
    });
    record(init.status === 200 && !!init.body?.result, 'MCP handshake with token', `-> ${init.status}`);

    // ------------------------------------------------------------ tools
    const tools = await rpc('tools/list', {});
    const list = tools.body?.result?.tools ?? [];
    record(list.length > 0, 'tools/list', `${list.length} tools`);

    // ------------------------------------------------------------ views
    // The failure this catches: the built HTML not making it into the image,
    // which leaves every interactive view blank with no error in the host.
    const view = await rpc('resources/read', { uri: 'ui://seo-cursor/audit.html' });
    const content = view.body?.result?.contents?.[0];
    record(
      content?.mimeType === 'text/html;profile=mcp-app' && content.text?.includes('<div id="root">'),
      'ui:// views are present in the image',
      content?.text ? `${(content.text.length / 1024).toFixed(0)} KB` : (view.body?.error?.message ?? 'missing'),
    );

    // ------------------------------------------------------------ database
    const sites = await rpc('tools/call', { name: 'list_sites', arguments: {} });
    const text = sites.body?.result?.content?.[0]?.text ?? '';
    const isError = sites.body?.result?.isError;
    record(
      !!text && !/failed/i.test(text),
      'database is reachable',
      isError ? text.slice(0, 90) : text.split('\n')[0]?.slice(0, 90),
    );
  }

  // -------------------------------------------------------------- scheduler
  // content-type is required: without it Astro's CSRF guard returns 403 before
  // the route's own auth runs, which would make this check pass for the wrong
  // reason and hide an unguarded endpoint.
  const tick = await fetch(`${base}/api/scheduler/tick`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
  record(
    tick.status === 401,
    'scheduler endpoint is guarded',
    tick.status === 200
      ? 'RAN UNAUTHENTICATED — set CRON_SECRET'
      : tick.status === 403
        ? 'got 403 (CSRF), expected 401 — check the request headers'
        : `-> ${tick.status}`,
  );
} catch (e) {
  console.error(`\nCheck failed: ${e.message}`);
  process.exit(1);
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
