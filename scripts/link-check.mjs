import { build } from 'esbuild';
import { join } from 'node:path';
const out = join(process.cwd(),'node_modules','.blog.mjs');
await build({entryPoints:[join(process.cwd(),'src/lib/blog.ts')],bundle:true,platform:'node',format:'esm',outfile:out,packages:'external',target:'node20',logLevel:'error'});
const { placeLinks } = await import(out+'?t='+Date.now());
const cases=[
 ['links exact anchor','Svich tracks class bookings daily.\n',[{url:'/classes',anchor:'class bookings'}],r=>r.includes('[class bookings](/classes)')],
 ['falls back to a sub-phrase','Svich tracks class bookings daily.\n',[{url:'/classes',anchor:'automated class bookings'}],r=>r.includes('](/classes)')],
 ['never links in a heading','## About class bookings\n\nText.\n',[{url:'/classes',anchor:'class bookings'}],r=>!r.includes('](/classes)')],
 ['leaves placed links alone','See [class bookings](/classes).\n',[{url:'/classes',anchor:'class bookings'}],r=>(r.match(/\/classes/g)||[]).length===1],
 ['skips absent phrases','All about payments.\n',[{url:'/classes',anchor:'class bookings'}],r=>!r.includes('](/classes)')],
 ['links each url once','class bookings here. class bookings again.\n',[{url:'/classes',anchor:'class bookings'}],r=>(r.match(/\]\(\/classes\)/g)||[]).length===1],
 ['does not corrupt existing links','Read [the guide](/docs) about class bookings.\n',[{url:'/classes',anchor:'class bookings'}],r=>r.includes('[the guide](/docs)')],
];
let pass=0,fail=0;
console.log('\nLink placement\n');
for(const [n,b,l,a] of cases){const r=placeLinks(b,l);const ok=a(r);console.log(`  ${ok?'ok  ':'FAIL'} ${n}`);if(!ok)console.log('     got:',JSON.stringify(r));ok?pass++:fail++;}
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
