import { request } from './http';

export type LinkVerdict = 'ok' | 'broken' | 'blocked' | 'unreachable' | 'unchecked';
export type LinkStatus = { status: number; verdict: LinkVerdict; redirectTo: string | null; error?: string };

const CONCURRENCY = 8;

/**
 * Resolve every unique link target.
 *
 * A non-200 is not automatically a broken link. Bot protection routinely
 * answers 401/403/429 to a crawler while serving people fine, and a timeout
 * says more about the network than the link. Only "this is gone" (404/410) and
 * server failures are reported as broken; the rest are flagged as unverified so
 * the audit never accuses a working link of being dead.
 */
export async function checkLinks(
  urls: string[],
  known: Map<string, LinkStatus>,
  onProgress?: (checked: number, total: number) => void,
): Promise<Map<string, LinkStatus>> {
  const out = new Map(known);
  const todo = urls.filter((u) => !out.has(u));

  let idx = 0;
  let checked = out.size;

  const worker = async (): Promise<void> => {
    while (true) {
      const url = todo[idx++];
      if (!url) return;

      let res = await request(url, { method: 'HEAD', timeoutMs: 9000 });
      // Many servers reject HEAD outright; retry with GET before judging.
      if (res.status === 405 || res.status === 501 || (res.status === 0 && !res.error?.includes('Timed out'))) {
        res = await request(url, { method: 'GET', timeoutMs: 10_000, readBody: false });
      }

      out.set(url, {
        status: res.status,
        verdict: classify(res.status, res.error),
        redirectTo: res.hops > 0 ? res.url : null,
        error: res.error,
      });

      checked++;
      if (checked % 20 === 0) onProgress?.(checked, todo.length + known.size);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  onProgress?.(checked, todo.length + known.size);
  return out;
}

export function classify(status: number, error?: string): LinkVerdict {
  if (error || status === 0) return 'unreachable';
  if (status >= 200 && status < 400) return 'ok';
  if (status === 401 || status === 403 || status === 429) return 'blocked';
  if (status === 404 || status === 410 || status >= 500) return 'broken';
  return 'blocked';
}
