/**
 * Exercise the database retry policy without a database.
 *
 * Neon suspends idle computes, so "Server has closed the connection" is a
 * normal part of life here rather than a fault. This checks the two things that
 * matter: a dropped read recovers, and a dropped write never silently replays.
 *
 *   npm run db-retry-check
 */
import { build } from 'esbuild';
import { join } from 'node:path';

const out = join(process.cwd(), 'node_modules', '.dbpolicy.mjs');
await build({
  entryPoints: [join(process.cwd(), 'src/lib/db.ts')],
  bundle: true, platform: 'node', format: 'esm', outfile: out,
  packages: 'external', target: 'node20', logLevel: 'error',
});
const { shouldRetry, RETRY_ATTEMPTS, backoffMs } = await import(out + '?t=' + Date.now());

const P1017 = 'Invalid `prisma.site.findMany()` invocation:\n\nServer has closed the connection.';

/** Replays the client's loop using the real exported policy. */
async function run(operation, failures, message) {
  let calls = 0, lastError, result;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      calls++;
      if (calls <= failures) throw new Error(message);
      result = 'ok';
      break;
    } catch (e) {
      lastError = e;
      if (!shouldRetry(operation, e.message)) return { calls, threw: e.message };
    }
  }
  return result ? { calls, result } : { calls, threw: lastError.message };
}

const cases = [
  ['read recovers after 1 drop',  'findMany', 1, P1017, (r) => r.calls === 2 && r.result === 'ok'],
  ['read recovers after 2 drops', 'findMany', 2, P1017, (r) => r.calls === 3 && r.result === 'ok'],
  ['read gives up after 3',       'findMany', 9, P1017, (r) => r.calls === 3 && /closed/.test(r.threw)],
  ['count is retried',            'count',    1, P1017, (r) => r.calls === 2 && r.result === 'ok'],
  ['create is NOT retried',       'create',   1, P1017, (r) => r.calls === 1 && /closed/.test(r.threw)],
  ['update is NOT retried',       'update',   1, P1017, (r) => r.calls === 1 && /closed/.test(r.threw)],
  ['delete is NOT retried',       'delete',   1, P1017, (r) => r.calls === 1 && /closed/.test(r.threw)],
  ['upsert is NOT retried',       'upsert',   1, P1017, (r) => r.calls === 1 && /closed/.test(r.threw)],
  ['a real error is not retried', 'findMany', 1, 'Unique constraint failed on the fields: (`slug`)', (r) => r.calls === 1 && /Unique/.test(r.threw)],
  ['pool timeout is retried',     'findMany', 1, 'Timed out fetching a new connection from the pool', (r) => r.calls === 2 && r.result === 'ok'],
  ['unreachable server retried',  'findFirst',1, "Can't reach database server at ep-x.neon.tech", (r) => r.calls === 2 && r.result === 'ok'],
];

let pass = 0, fail = 0;
console.log(`\nDatabase retry policy — ${RETRY_ATTEMPTS} attempts, backoff ${[0, 1, 2].map(backoffMs).join('/')}ms\n`);
for (const [name, op, fails, msg, assert] of cases) {
  const r = await run(op, fails, msg);
  const ok = assert(r);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(30)} ${r.calls} call${r.calls > 1 ? 's' : ''}${r.threw ? ', threw' : ', recovered'}`);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
