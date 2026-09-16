import { build } from 'esbuild';
import { join } from 'node:path';
const out = join(process.cwd(), 'node_modules', '.facts.mjs');
await build({ entryPoints:[join(process.cwd(),'src/lib/facts.ts')], bundle:true, platform:'node', format:'esm', outfile:out, packages:'external', target:'node20', logLevel:'error' });
const { findFabrication } = await import(out + '?t=' + Date.now());
const facts = {
  brand:['svich'],
  vocabulary:new Set(['whatsapp','reminder','renewal','member','attendance','biometric','door','access','payment','class','booking','setting','marketing','follow','dashboard','plan','expiry','gym','studio','invoice','due']),
  urls:new Set(['/pricing','/docs/gymos/members']),
};
const cases = [
  ['flags an unsourced statistic','This cuts churn from 4.2% to 2.7% in three months.',1],
  ['flags invented ROC figures','The model reached an AUC of 0.82 with 68% recall.',1],
  ['flags a screenshot figure','The dashboard shows revenue of ₹4,18,600 this month.',1],
  ['flags an invented endpoint','Export members via the `/api/v1/members` endpoint.',1],
  ['flags a real research claim','A survey of 400 gym owners found most churn happens in month two.',1],
  ['allows a product survey','Svich can send a survey to members through the member portal.',0],
  ['flags an invented UI label','Open the `Churn Risk Scoring` panel to see the list.',1],
  ['ignores bold used for emphasis','You should **offer a special discount** to members who lapse.',0],
  ['allows a real UI path','Open **Settings** then **Marketing and Follow-ups**.',0],
  ['flags a link to nowhere','Read more on our [blog](/nonexistent-page).',1],
  ['allows a real link','See [pricing](/pricing) for detail.',0],
  ['allows ordinary prose','Svich helps gym owners predict and prevent member churn by reviewing attendance.',0],
  ['allows a cited statistic','According to Statista, 50% of members quit within six months.',0],
];
let pass=0,fail=0;
console.log('\nFabrication detection\n');
for (const [name,text,expected] of cases) {
  const hits=findFabrication(text,facts);
  const ok=hits.length===expected;
  console.log(`  ${ok?'ok  ':'FAIL'} ${name.padEnd(30)} ${hits.length} flag(s)${hits.length?': '+hits[0].kind:''}`);
  ok?pass++:fail++;
}
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
