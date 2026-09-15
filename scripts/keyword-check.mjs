/**
 * Verify the DataForSEO wiring: credentials, market list, and the shape of
 * each research call — without spending more than the smallest real request.
 *
 *   npm run keyword-check              # account + markets only (both free)
 *   npm run keyword-check -- --live    # also runs one small billed call
 */
import { build } from 'esbuild';
import { join } from 'node:path';

try { process.loadEnvFile(); } catch { /* no .env */ }

const out = join(process.cwd(), 'node_modules', '.dfs-entry.mjs');
await build({
  entryPoints: [join(process.cwd(), 'src/lib/dataforseo.ts')],
  bundle: true, platform: 'node', format: 'esm', outfile: out,
  packages: 'external', target: 'node20', logLevel: 'error',
});
const dfs = await import(out + '?t=' + Date.now());

console.log('\nCredentials');
console.log('  DATAFORSEO_LOGIN     ', process.env.DATAFORSEO_LOGIN ? 'set' : 'not set');
console.log('  DATAFORSEO_PASSWORD  ', process.env.DATAFORSEO_PASSWORD ? 'set' : 'not set');

if (!dfs.configured()) {
  console.log('\n  Nothing else can be checked without credentials.');
  console.log('  Get them at app.dataforseo.com/api-access and add both to .env.\n');
  process.exit(0);
}

console.log('\nAccount (free calls)');
const account = await dfs.verifyAccount();

if (account.credentialsValid) {
  console.log(`  ✓ credentials    ${account.login ?? 'accepted'} · balance $${account.balanceUsd?.toFixed(2) ?? '?'}`);
} else {
  console.log(`  ✗ credentials    ${account.error}`);
  console.log();
  process.exit(1);
}

if (!account.ok) {
  console.log(`  ✗ API access     ${account.error}`);
  console.log();
  process.exit(1);
}
console.log('  ✓ API access     open');

console.log('\nMarkets (free call)');
let locs;
try {
  locs = await dfs.locations();
} catch (e) {
  console.log(`  ✗ ${e.message}\n`);
  process.exit(1);
}
console.log(`  ${locs.length} countries available`);
for (const name of ['India', 'United States', 'United Kingdom']) {
  const l = locs.find((x) => x.locationName === name);
  console.log(`    ${name.padEnd(16)} ${l ? `code ${l.locationCode}, ${l.languages.length} languages` : 'NOT FOUND'}`);
}

if (!process.argv.includes('--live')) {
  console.log('\n  Pass --live to also run one small billed research call.\n');
  process.exit(0);
}

const india = locs.find((x) => x.locationName === 'India') ?? locs[0];
const market = {
  locationCode: india.locationCode,
  locationName: india.locationName,
  languageCode: india.languages.find((l) => l.code === 'en')?.code ?? india.languages[0].code,
  languageName: 'English',
};
console.log(`\nLive calls — ${market.locationName} · ${market.languageCode}`);

const show = (label, rows) => {
  console.log(`  ${label}: ${rows.length} rows`);
  for (const r of rows.slice(0, 3)) {
    console.log(`    "${r.keyword}" — ${r.volume}/mo, difficulty ${r.difficulty ?? '—'}, $${r.cpc.toFixed(2)}${r.position !== null ? `, position ${r.position}` : ''}`);
  }
};

try {
  const ideas = await dfs.keywordIdeas(['gym management software'], market, 10);
  show('keywordIdeas', ideas);

  const diff = await dfs.bulkDifficulty(ideas.slice(0, 5).map((k) => k.keyword), market);
  console.log(`  bulkDifficulty: ${diff.size} scored`);
  for (const [k, v] of [...diff].slice(0, 3)) console.log(`    "${k}" — ${v}`);
} catch (e) {
  console.log(`  ✗ ${e.message}`);
  console.log();
  process.exit(1);
}

console.log();
