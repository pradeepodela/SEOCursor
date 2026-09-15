import { request } from './http';
import * as cheerio from 'cheerio';

export type RenderMode = 'http' | 'browser';

/**
 * Decide whether a site needs a real browser.
 *
 * This matters more than it sounds. A client-rendered app returns a near-empty
 * shell to a plain HTTP fetch, and every SEO rule downstream would then report
 * missing titles, no headings and thin content on every page — confidently, and
 * completely wrongly. Detecting the shell is what stops that.
 */
export async function pickRenderMode(url: string): Promise<RenderMode> {
  const res = await request(url, { timeoutMs: 12_000 });
  if (!res.body) return 'http';

  const $ = cheerio.load(res.body);
  $('script, style, noscript, template').remove();
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  const words = text ? text.split(' ').length : 0;

  const scripts = cheerio.load(res.body)('script[src]').length;
  const hasRoot = /<div[^>]+id=["'](root|app|__next|__nuxt)["']/i.test(res.body);

  // A shell: almost no server-rendered text, but plenty of JavaScript.
  const looksLikeShell = words < 120 && (scripts >= 2 || hasRoot);
  return looksLikeShell ? 'browser' : 'http';
}

/**
 * Is a headless browser actually available here?
 *
 * Playwright is an optional dependency — the specifier is built at runtime so
 * the bundler does not try to resolve it when it is not installed.
 */
export async function browserAvailable(): Promise<boolean> {
  try {
    const spec = 'play' + 'wright';
    const pw = (await import(/* @vite-ignore */ spec)) as { chromium?: { launch?: unknown } };
    return typeof pw.chromium?.launch === 'function';
  } catch {
    return false;
  }
}
