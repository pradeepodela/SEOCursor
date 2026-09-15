/**
 * .env loader.
 *
 * Nothing in this stack actually puts .env into `process.env`. Vite parses the
 * file but only exposes it on `import.meta.env`; Prisma reads it for its own
 * connection string and nothing else; plain `node scripts/*.mjs` never reads it
 * at all. So a key that is definitely written to .env still reads as unset
 * everywhere the code checks `process.env` — which is why the settings panel
 * reported a missing key. Load the file here and call `loadEnv()` wherever a
 * key is read.
 *
 * A real environment variable always wins over the file, so deployments that
 * inject secrets properly are unaffected.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Deliberately forgiving: keys get trimmed, so `GOOGLE_CLIENT_ID = x` works as
 * written rather than silently defining a variable with a space in its name.
 */
function parse(src: string): Record<string, string> {
  const out: Record<string, string> = {};

  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq < 1) continue;

    const key = line.slice(0, eq).replace(/^export\s+/, '').trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = line.slice(eq + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length > 1) {
      value = value.slice(1, -1);
      if (quote === '"') value = value.replace(/\\n/g, '\n');
    } else {
      // Unquoted values end at an inline comment.
      value = value.replace(/\s+#.*$/, '').trim();
    }

    out[key] = value;
  }

  return out;
}

/** Resolved once: the file does not move while the process runs. */
let envPath: string | null | undefined;

function findEnvFile(): string | null {
  if (envPath !== undefined) return envPath;

  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) return (envPath = candidate);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return (envPath = null);
}

/**
 * Keys this loader set, as opposed to ones the real environment provided.
 *
 * Parked on globalThis because Vite reloads this module when .env changes,
 * which would reset the record while the stale value survives in the
 * process-level `process.env` — and a key removed from the file would then
 * stay set forever.
 */
const store = globalThis as unknown as { __envOwned?: Set<string> };
store.__envOwned ??= new Set<string>();

let seenMtime = -1;

/**
 * Reloads when the file changes on disk, so adding a key means saving .env and
 * refreshing the page rather than remembering to restart the server. An mtime
 * check per call costs microseconds and removes a whole class of "I set it but
 * it is not reflecting".
 */
export function loadEnv(): void {
  const file = findEnvFile();
  if (!file) return;

  let source: string;
  try {
    const mtime = statSync(file).mtimeMs;
    if (mtime === seenMtime) return;
    source = readFileSync(file, 'utf8');
    seenMtime = mtime;
  } catch {
    return;
  }

  const parsed = parse(source);
  const previous = store.__envOwned!;
  const owned = new Set<string>();
  store.__envOwned = owned;

  for (const [key, value] of Object.entries(parsed)) {
    // A value this loader set last time is ours to update; otherwise a
    // corrected key would never take effect without a restart.
    if (process.env[key] === undefined || process.env[key] === '' || previous.has(key)) {
      process.env[key] = value;
      owned.add(key);
    }
  }

  // A key removed from the file should stop being set.
  for (const key of previous) {
    if (!(key in parsed)) delete process.env[key];
  }
}

loadEnv();
