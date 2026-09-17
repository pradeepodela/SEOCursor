import type { APIRoute } from 'astro';
import { tick, schedulerStatus } from '../../../lib/scheduler';
import { ok, fail } from '../../../lib/schemas';

export const prerender = false;

/**
 * Cron entry point.
 *
 * Point a real scheduler at this — Railway cron, GitHub Actions, or plain crontab:
 *
 *   curl -X POST -H "authorization: Bearer $CRON_SECRET" \
 *        -H "content-type: application/json" https://.../api/scheduler/tick
 *
 * The content-type is required, not decoration. Astro's `security.checkOrigin`
 * is on by default and rejects a POST that arrives with no content-type as a
 * cross-site form submission — a 403 raised before this route runs at all, so
 * the tick looks unauthorised when it was never even reached. `npm run
 * scheduler:tick` sends it correctly.
 *
 * Guarded by CRON_SECRET. Without that variable set, only local requests are
 * accepted, so an unprotected deployment cannot be triggered by anyone.
 */
function authorised(request: Request, clientAddress: string): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get('authorization') ?? '';
    return header === `Bearer ${secret}`;
  }
  return ['127.0.0.1', '::1', 'localhost', ''].includes(clientAddress);
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!authorised(request, clientAddress ?? '')) {
    return fail('Set CRON_SECRET and send it as a bearer token', 401);
  }
  const result = await tick();
  return ok(result);
};

export const GET: APIRoute = async ({ request, clientAddress }) => {
  if (!authorised(request, clientAddress ?? '')) return fail('Unauthorised', 401);
  return ok(schedulerStatus());
};
