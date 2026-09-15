import './env';
import { PrismaClient } from '@prisma/client';

const g = globalThis as unknown as { __prisma?: PrismaClient };

export const db = g.__prisma ?? new PrismaClient();

// Reuse one client across HMR reloads and CLI scripts. `import.meta.env` only
// exists under Vite, so this module stays usable from plain node too.
const isDev =
  (typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV) ??
  process.env.NODE_ENV !== 'production';

if (isDev) g.__prisma = db;
