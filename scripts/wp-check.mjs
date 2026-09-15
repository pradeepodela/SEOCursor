/**
 * Is the WordPress REST API reachable, and do these credentials work?
 *
 *   node scripts/wp-check.mjs <url> [username] [application-password]
 *
 * Without credentials it checks only what can be checked anonymously: that the
 * URL is the REST root and that application passwords are enabled.
 *
 * It deliberately does NOT try to infer why a login failed. WordPress returns
 * null rather than an error when an application password does not validate, so
 * a wrong password, a revoked one and a server that strips the Authorization
 * header all produce the same "not logged in" response — confirmed against
 * wordpress.org and ma.tt, which answer bogus credentials exactly as your own
 * site does. Only a successful login is informative.
 */
const [input, username, ...pwParts] = process.argv.slice(2);
if (!input) {
  console.error('Usage: node scripts/wp-check.mjs <url> [username] [application-password]');
  process.exit(1);
}
const appPassword = pwParts.join(' ');

const base = input.trim()
  .replace(/\/(wp-admin(\/.*)?|wp-login\.php|wp-json(\/.*)?)$/i, '')
  .replace(/\/+$/, '');

const get = async (path, headers = {}) => {
  const res = await fetch(base + path, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* an HTML page, not the API */ }
  return { status: res.status, json };
};

console.log(`\n  base url   ${base}`);

const root = await get('/wp-json/');
if (!root.json) {
  console.log(`  REST API   unreachable — ${base}/wp-json/ returned a page, not JSON`);
  console.log('             Check this is the WordPress home URL and the REST API is not disabled.\n');
  process.exit(1);
}
console.log(`  site       ${root.json.name}`);
console.log(`  home       ${root.json.home}`);

const appPwds = !!root.json.authentication?.['application-passwords'];
console.log(`  app pwds   ${appPwds ? 'enabled' : 'NOT advertised — enable them, or the site is not on HTTPS'}`);

if (!username || !appPassword) {
  console.log('\n  The REST API is reachable. Pass a username and application password to test a login:');
  console.log(`    node scripts/wp-check.mjs ${base} <username> <application-password>\n`);
  process.exit(0);
}

const compact = appPassword.replace(/\s+/g, '');
if (compact.length !== 24) {
  console.log(`\n  ! That password is ${compact.length} characters. Application passwords are 24`);
  console.log('    (six groups of four). An account password will always be rejected.');
}

const me = await get('/wp-json/wp/v2/users/me?context=edit', {
  authorization: 'Basic ' + Buffer.from(`${username}:${compact}`).toString('base64'),
});

if (me.json?.id) {
  const canPublish = me.json.capabilities?.publish_posts === true;
  console.log(`\n  ✓ Signed in as ${me.json.name} (id ${me.json.id})`);
  console.log(`    publish_posts: ${canPublish ? 'yes' : 'NO — this user cannot publish'}\n`);
  process.exit(canPublish ? 0 : 1);
}

console.log(`\n  ✗ Rejected — ${me.status} ${me.json?.code ?? ''}`);
console.log('    WordPress does not say why. Two causes are possible and this cannot tell them apart:');
console.log('      1. The application password is wrong, revoked, or is an account password.');
console.log('      2. The server strips the Authorization header before PHP sees it (some Apache hosts).');
const folder = new URL(base).pathname.replace(/\/+$/, '');
console.log(`\n    For (2), in the .htaccess next to wp-config.php${folder ? ` (the ${folder} folder)` : ''}, above # BEGIN WordPress:`);
console.log('      RewriteEngine On');
console.log('      RewriteCond %{HTTP:Authorization} ^(.*)');
console.log('      RewriteRule .* - [e=HTTP_AUTHORIZATION:%1]');
console.log('    If that changes nothing and PHP runs as CGI/FastCGI, use CGIPassAuth On instead.\n');
process.exit(1);
