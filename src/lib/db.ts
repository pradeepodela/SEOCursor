import './env';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma against Neon.
 *
 * Neon suspends the compute when a project goes idle, so a pooled connection
 * that was fine a minute ago is gone by the time the next request uses it, and
 * Prisma surfaces that as "Server has closed the connection" (P1017) before it
 * reconnects. It is transient by definition — the retry below is what turns it
 * back into a working page rather than a stack trace on first load after lunch.
 */

/** Errors that mean "the connection died", not "the query was wrong". */
const TRANSIENT =
  /Server has closed the connection|Can't reach database server|Connection terminated|connection closed|ECONNRESET|Timed out fetching a new connection/i;

/**
 * Reads only.
 *
 * A dropped connection does not say whether the statement ran before it went,
 * so replaying a write could duplicate it. Reads have no such risk, and reads
 * are what a cold page load is made of.
 */
const READS = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
  'count', 'aggregate', 'groupBy',
]);

export const RETRY_ATTEMPTS = 3;

/**
 * Exported so the retry policy can be tested without a database — the logic is
 * only worth having if it is the same logic the client actually runs.
 */
export function shouldRetry(operation: string, message: string): boolean {
  return READS.has(operation) && TRANSIENT.test(message);
}

export const backoffMs = (attempt: number): number => 200 * (attempt + 1);

function build(): PrismaClient {
  const base = new PrismaClient();

  return base.$extends({
    name: 'retry-transient-reads',
    query: {
      async $allOperations({ operation, args, query }) {
        let lastError: unknown;

        for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
          try {
            return await query(args);
          } catch (e) {
            lastError = e;
            if (!shouldRetry(operation, (e as Error)?.message ?? '')) throw e;
            // Neon needs a moment to wake; backing off beats hammering it.
            await new Promise((r) => setTimeout(r, backoffMs(attempt)));
          }
        }

        throw lastError;
      },
    },
  }) as unknown as PrismaClient;
}

const g = globalThis as unknown as { __prisma?: PrismaClient };

export const db = g.__prisma ?? build();

// Reuse one client across HMR reloads and CLI scripts. `import.meta.env` only
// exists under Vite, so this module stays usable from plain node too.
const isDev =
  (typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV) ??
  process.env.NODE_ENV !== 'production';

if (isDev) g.__prisma = db;
