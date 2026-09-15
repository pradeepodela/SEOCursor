/** Verify provider routing and key status without spending anything. */
import { build } from 'esbuild';
import { join } from 'node:path';

const out = join(process.cwd(), 'node_modules', '.llm-entry.mjs');
await build({
  entryPoints: [join(process.cwd(), 'src/lib/llm.ts')],
  bundle: true, platform: 'node', format: 'esm', outfile: out,
  packages: 'external', target: 'node20', logLevel: 'error',
});
const llm = await import(out + '?t=' + Date.now());

console.log('\nModel reference parsing');
for (const ref of [
  'groq:openai/gpt-oss-20b',
  'openrouter:anthropic/claude-sonnet-5',
  'anthropic/claude-haiku-4.5',      // legacy, unprefixed
  'groq:qwen/qwen3.8-27b',
]) {
  const { provider, model } = llm.parseModelRef(ref);
  console.log(`  ${ref.padEnd(40)} → ${provider.padEnd(11)} ${model}`);
}

console.log('\nProvider keys');
const all = await llm.verifyAll();
for (const p of all) {
  const state = p.ok ? 'connected' : p.configured ? `rejected (${p.error})` : 'not set';
  console.log(`  ${p.label.padEnd(12)} ${p.env.padEnd(20)} ${state}${p.models ? ` · ${p.models} models` : ''}${p.credits != null ? ` · $${p.credits.toFixed(2)}` : ''}`);
}

console.log(`\nany usable: ${llm.llmConfigured()}`);
console.log(`models offered: ${llm.MODEL_CHOICES.length} total, ${llm.availableModels().length} with a working key\n`);
