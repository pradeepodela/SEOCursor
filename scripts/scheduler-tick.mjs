/**
 * Cron entry point — fires the scheduler once, then exits.
 *
 * This exists so the Railway cron service's start command is `npm run
 * scheduler:tick` rather than a paragraph of inlined JavaScript pasted into a
 * dashboard field.
 *
 * Exiting matters. Railway triggers a cron by running a service's start
 * command, and if that process stays alive the next scheduled run is skipped
 * silently — so every path here terminates, including the failures.
 *
 * Env:
 *   SCHEDULER_URL  full URL of the tick endpoint, or the app's base URL
 *   CRON_SECRET    must match the web service's CRON_SECRET
 */

const raw = process.env.SCHEDULER_URL?.trim();
const secret = process.env.CRON_SECRET?.trim();

if (!raw) {
  console.error(
    'SCHEDULER_URL is not set. Point it at the deployed app, e.g. https://your-app.up.railway.app',
  );
  process.exit(1);
}

if (!secret) {
  // Without the secret the endpoint accepts local requests only, and this runs
  // in a different container than the web service — so it would always 401.
  console.error('CRON_SECRET is not set. It must match the web service, or every tick is rejected.');
  process.exit(1);
}

// Accept either the bare origin or the full endpoint, since both are things a
// person reasonably pastes into an environment variable.
const url = raw.includes('/api/scheduler/tick')
  ? raw
  : `${raw.replace(/\/+$/, '')}/api/scheduler/tick`;

// A generation run writes a whole blog post, so the tick can legitimately take
// minutes. Bound it anyway: a request that hangs forever would block the next
// scheduled run rather than fail it.
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10 * 60_000);

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      // Not optional. Astro's security.checkOrigin is on by default and
      // answers 403 "Cross-site POST form submissions are forbidden" to a POST
      // that arrives with no content-type — before the route's own auth runs.
      // Without this header the tick is rejected and the scheduler silently
      // never fires.
      'content-type': 'application/json',
    },
    signal: controller.signal,
  });

  const body = await res.text();
  clearTimeout(timeout);

  if (!res.ok) {
    console.error(`[scheduler] ${url} returned ${res.status}: ${body.slice(0, 500)}`);
    process.exit(1);
  }

  // The endpoint reports what it did; surface it so the cron log is worth
  // reading rather than just "exit 0".
  try {
    const { data } = JSON.parse(body);
    const generated = data?.generated?.length ?? 0;
    const published = data?.published?.length ?? 0;
    const failed = data?.failed?.length ?? 0;
    console.log(`[scheduler] generated ${generated}, published ${published}, failed ${failed}`);
    if (failed) console.error(`[scheduler] failures: ${JSON.stringify(data.failed)}`);
  } catch {
    console.log(`[scheduler] ${body.slice(0, 300)}`);
  }

  process.exit(0);
} catch (e) {
  clearTimeout(timeout);
  const err = /** @type {Error} */ (e);
  console.error(
    err.name === 'AbortError'
      ? `[scheduler] ${url} did not respond within 10 minutes`
      : `[scheduler] ${err.message}`,
  );
  process.exit(1);
}
