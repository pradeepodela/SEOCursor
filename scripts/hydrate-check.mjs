/**
 * Load each screen in a real browser and fail on client-side errors.
 *
 * Every other check here fetches HTML, which is not enough: when a React
 * island throws during hydration, React clears the container, so a page whose
 * server HTML is perfect can render as a blank card in the browser. That is
 * invisible to a fetch and obvious here.
 *
 *   npm run hydrate-check
 */
import { chromium } from 'playwright';

const B = process.env.BASE ?? 'http://localhost:4330';

/** Interactive things that only exist if their island hydrated. */
const SCREENS = [
  ['/', []],
  ['/audit', []],
  ['/pages', []],
  ['/links', []],
  ['/keywords', []],
  ['/ideas', []],
  ['/calendar', []],
  ['/studio', []],
  ['/websites', []],
  ['/connect', ['input']],
  ['/settings', ['input[placeholder="https://yourblog.com"]', 'button:has-text("Connect and verify")']],
];

const browser = await chromium.launch();
let pass = 0, fail = 0;

console.log(`\nHydration check — ${B}\n`);

for (const [path, required] of SCREENS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  const notes = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // A failed fetch is the app's business — it renders an error state and
    // carries on. Only uncaught JS breaks hydration.
    if (/Failed to load resource/i.test(m.text())) { notes.push(m.text()); return; }
    errors.push(m.text());
  });

  let note = '';
  try {
    const res = await page.goto(B + path, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(600);

    const missing = [];
    for (const sel of required) {
      if (await page.locator(sel).count() === 0) missing.push(sel);
    }

    const ok = res.status() === 200 && errors.length === 0 && missing.length === 0;
    if (ok) { pass++; } else {
      fail++;
      if (res.status() !== 200) note = `status ${res.status()}`;
      else if (errors.length) note = errors[0].slice(0, 90);
      else note = `missing ${missing.join(', ')}`;
    }
    if (ok && notes.length) note = `(${notes.length} request${notes.length > 1 ? 's' : ''} refused by a backing API — handled)`;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${path.padEnd(12)} ${note}`);
  } catch (e) {
    fail++;
    console.log(`  FAIL ${path.padEnd(12)} ${e.message.split('\n')[0].slice(0, 90)}`);
  }
  await page.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
