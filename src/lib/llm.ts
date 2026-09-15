/**
 * Multi-provider LLM client.
 *
 * Both providers speak the OpenAI chat-completions shape, so one request path
 * covers them and the only real difference is the base URL, the key and the
 * headers. Keys live in the environment and never touch the database; model
 * choice is per-site and stored as "provider:model".
 */

// Keys come from .env; nothing else in the stack loads it into process.env.
import { loadEnv } from './env';

export type Provider = 'openrouter' | 'groq';

const PROVIDERS: Record<Provider, { base: string; label: string; env: string; keysUrl: string }> = {
  openrouter: {
    base: 'https://openrouter.ai/api/v1',
    label: 'OpenRouter',
    env: 'OPENROUTER_API_KEY',
    keysUrl: 'openrouter.ai/keys',
  },
  groq: {
    base: 'https://api.groq.com/openai/v1',
    label: 'Groq',
    env: 'GROQ_API_KEY',
    keysUrl: 'console.groq.com/keys',
  },
};

export const PROVIDER_META = PROVIDERS;

/**
 * Model references are stored as "provider:model". Anything unprefixed is
 * OpenRouter, which is what earlier rows contain.
 */
export function parseModelRef(ref: string): { provider: Provider; model: string } {
  const idx = ref.indexOf(':');
  if (idx > 0) {
    const head = ref.slice(0, idx) as Provider;
    if (head in PROVIDERS) return { provider: head, model: ref.slice(idx + 1) };
  }
  return { provider: 'openrouter', model: ref };
}

export const modelRef = (provider: Provider, model: string) => `${provider}:${model}`;

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type LlmUsage = { promptTokens: number; outputTokens: number; costUsd: number | null };
export type LlmResult<T> = { data: T; usage: LlmUsage; model: string };

export const providerConfigured = (p: Provider): boolean => {
  loadEnv();
  return !!process.env[PROVIDERS[p].env];
};

/** At least one provider usable. */
export const llmConfigured = (): boolean =>
  (Object.keys(PROVIDERS) as Provider[]).some(providerConfigured);

export const configuredProviders = (): Provider[] =>
  (Object.keys(PROVIDERS) as Provider[]).filter(providerConfigured);

function apiKey(p: Provider): string {
  loadEnv();
  const key = process.env[PROVIDERS[p].env];
  if (!key) throw new Error(`${PROVIDERS[p].env} is not set — add it to .env to use ${PROVIDERS[p].label}`);
  return key;
}

/** Models offered in the picker, with a note on why you would choose each. */
export const MODEL_CHOICES: { id: string; provider: Provider; label: string; note: string; tier: 'fast' | 'balanced' | 'premium' }[] = [
  // Groq — open models on very fast hardware, priced low. Groq retires models
  // without much notice, so this list is filtered against their live catalogue
  // before it reaches the picker.
  { id: 'groq:openai/gpt-oss-20b', provider: 'groq', label: 'GPT-OSS 20B', note: 'Groq · ~1000 tok/s, cheapest here — ideal for bulk titles', tier: 'fast' },
  { id: 'groq:openai/gpt-oss-120b', provider: 'groq', label: 'GPT-OSS 120B', note: 'Groq · flagship open model, still very fast — good for drafts', tier: 'balanced' },
  { id: 'groq:qwen/qwen3.8-27b', provider: 'groq', label: 'Qwen 3.8 27B', note: 'Groq · strong long-form writing', tier: 'balanced' },
  { id: 'groq:groq/compound-mini', provider: 'groq', label: 'Compound Mini', note: 'Groq · fast, with built-in web search', tier: 'fast' },

  // OpenRouter — access to the frontier closed models.
  { id: 'openrouter:anthropic/claude-haiku-4.5', provider: 'openrouter', label: 'Claude Haiku 4.5', note: 'OpenRouter · fast and cheap', tier: 'fast' },
  { id: 'openrouter:anthropic/claude-sonnet-5', provider: 'openrouter', label: 'Claude Sonnet 5', note: 'OpenRouter · best balance for full articles', tier: 'balanced' },
  { id: 'openrouter:anthropic/claude-opus-5', provider: 'openrouter', label: 'Claude Opus 5', note: 'OpenRouter · strongest reasoning, highest cost', tier: 'premium' },
  { id: 'openrouter:openai/gpt-sol-latest', provider: 'openrouter', label: 'GPT Sol', note: 'OpenRouter · OpenAI frontier', tier: 'balanced' },
  { id: 'openrouter:google/gemini-flash-latest', provider: 'openrouter', label: 'Gemini Flash', note: 'OpenRouter · cheap, very long context', tier: 'fast' },
];

/** Only the models whose provider actually has a key. */
export const availableModels = () => {
  const ready = new Set(configuredProviders());
  return MODEL_CHOICES.filter((m) => ready.has(m.provider));
};

/**
 * Offering a model the provider has retired fails at generation time with a
 * confusing error, so when the provider can tell us what it actually serves,
 * the hard-coded list is narrowed to that. OpenRouter's catalogue is huge and
 * stable, so only Groq is checked; a failed lookup falls back to the full list
 * rather than emptying the picker.
 */
export async function liveModels(): Promise<typeof MODEL_CHOICES> {
  const offered = availableModels();
  if (!providerConfigured('groq')) return offered;

  let served: Set<string>;
  try {
    const res = await fetch(`${PROVIDERS.groq.base}/models`, {
      headers: { authorization: `Bearer ${apiKey('groq')}` },
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json();
    if (!res.ok || !Array.isArray(json.data)) return offered;
    served = new Set(json.data.map((m: { id: string }) => m.id));
  } catch {
    return offered;
  }

  return offered.filter((m) => m.provider !== 'groq' || served.has(parseModelRef(m.id).model));
}

/**
 * Why a chosen model cannot be used right now, or null if it can.
 *
 * The raw "OPENROUTER_API_KEY is not set" thrown at call time is true but
 * unhelpful: the user set a Groq key and has no idea the site's draft model
 * still points elsewhere. Name the setting, not just the variable.
 */
export function modelBlocker(ref: string, setting: string): string | null {
  const { provider, model } = parseModelRef(ref);
  if (providerConfigured(provider)) return null;

  const cfg = PROVIDERS[provider];
  const others = configuredProviders().map((p) => PROVIDERS[p].label);
  const remedy = others.length
    ? `Pick a ${others.join(' or ')} model in Settings, or add ${cfg.env} to .env.`
    : `Add ${cfg.env} to .env.`;

  return `This site's ${setting} is ${model} on ${cfg.label}, but ${cfg.env} is not set. ${remedy}`;
}

/**
 * Sensible starting models for a new website.
 *
 * A static schema default cannot know which provider has a key, so a new site
 * would point at a provider the user never configured and fail on first use.
 * Pick from what is actually reachable: cheap and fast for bulk titles, the
 * strongest available for drafting.
 */
export function defaultModels(): { ideaModel: string; draftModel: string } {
  const ready = new Set(configuredProviders());

  const pick = (preferences: string[], fallback: string) =>
    preferences.find((id) => ready.has(parseModelRef(id).provider)) ?? fallback;

  return {
    ideaModel: pick(
      ['groq:openai/gpt-oss-20b', 'openrouter:anthropic/claude-haiku-4.5'],
      'groq:openai/gpt-oss-20b',
    ),
    draftModel: pick(
      ['openrouter:anthropic/claude-sonnet-5', 'groq:openai/gpt-oss-120b'],
      'groq:openai/gpt-oss-120b',
    ),
  };
}

type ChatOptions = {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Ask the model for JSON and parse it. */
  json?: boolean;
  timeoutMs?: number;
};

/**
 * How long a 429 wants us to wait. Providers put it in Retry-After when they
 * are being tidy and in the prose otherwise; 30s is the ceiling, past which
 * failing fast is the better answer.
 */
function retryDelayMs(res: Response, message: string): number {
  const header = Number(res.headers.get('retry-after'));
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, 30_000) + 250;

  const spoken = message.match(/try again in ([\d.]+)\s*s/i);
  if (spoken) return Math.min(Number(spoken[1]) * 1000, 30_000) + 250;

  return 2_000;
}

async function chat(opts: ChatOptions): Promise<{ content: string; usage: LlmUsage; model: string }> {
  const { provider, model } = parseModelRef(opts.model);
  const cfg = PROVIDERS[provider];

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 180_000);

  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey(provider)}`,
    'content-type': 'application/json',
  };
  if (provider === 'openrouter') {
    // OpenRouter uses these for attribution on their dashboard.
    headers['HTTP-Referer'] = process.env.PUBLIC_APP_URL ?? 'http://localhost:4330';
    headers['X-Title'] = 'SEO Cursor';
  }

  const body = JSON.stringify({
    model,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.7,
    ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
  });

  let res: Response;
  let json: any;

  // Groq's free tier has a low tokens-per-minute ceiling and a two-pass draft
  // trips it routinely. The 429 says exactly how long to wait, so waiting is
  // strictly better than surfacing a failure the user can only fix by
  // re-clicking. Only the wait is retried — nothing is re-billed.
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(`${cfg.base}/chat/completions`, { method: 'POST', signal: ctrl.signal, headers, body });
    } catch (e) {
      clearTimeout(timer);
      throw new Error((e as Error).name === 'AbortError' ? 'The model took too long to respond' : (e as Error).message);
    }

    json = await res.json().catch(() => ({}));
    if (res.ok) break;

    const msg: string = json?.error?.message ?? json?.message ?? `${cfg.label} returned ${res.status}`;
    const wait = res.status === 429 ? retryDelayMs(res, msg) : 0;
    if (!wait || attempt >= 2) {
      clearTimeout(timer);
      throw new Error(`${cfg.label}: ${msg}`);
    }
    await new Promise((r) => setTimeout(r, wait));
  }

  clearTimeout(timer);

  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('The model returned an empty response');
  }

  return {
    content,
    model: json.model ? modelRef(provider, json.model) : opts.model,
    usage: {
      promptTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
      costUsd: typeof json.usage?.cost === 'number' ? json.usage.cost : null,
    },
  };
}

/** Plain text completion. */
export async function complete(opts: Omit<ChatOptions, 'json'>): Promise<LlmResult<string>> {
  const r = await chat(opts);
  return { data: r.content, usage: r.usage, model: r.model };
}

/**
 * Structured completion.
 *
 * Models wrap JSON in prose or fences often enough that parsing has to be
 * defensive; a failure here should say what came back, not just "invalid JSON".
 */
export async function completeJson<T>(opts: Omit<ChatOptions, 'json'>): Promise<LlmResult<T>> {
  const r = await chat({ ...opts, json: true });
  const cleaned = stripFences(r.content);

  try {
    return { data: JSON.parse(cleaned) as T, usage: r.usage, model: r.model };
  } catch {
    // Last resort: pull the outermost JSON object or array out of the text.
    const match = cleaned.match(/[[{][\s\S]*[\]}]/);
    if (match) {
      try {
        return { data: JSON.parse(match[0]) as T, usage: r.usage, model: r.model };
      } catch { /* fall through */ }
    }
    throw new Error(`The model did not return valid JSON. It said: ${r.content.slice(0, 200)}`);
  }
}

const stripFences = (s: string): string =>
  s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

/** Rough cost when OpenRouter does not report one. */
export function estimateCost(usage: LlmUsage): number | null {
  return usage.costUsd;
}

export type KeyStatus = {
  provider: Provider;
  label: string;
  env: string;
  keysUrl: string;
  configured: boolean;
  ok: boolean;
  error: string | null;
  credits: number | null;
  models: number | null;
};

/** Check one provider's key actually works. */
export async function verifyProvider(provider: Provider): Promise<KeyStatus> {
  const cfg = PROVIDERS[provider];
  const base: KeyStatus = {
    provider, label: cfg.label, env: cfg.env, keysUrl: cfg.keysUrl,
    configured: providerConfigured(provider), ok: false, error: null, credits: null, models: null,
  };
  if (!base.configured) return base;

  try {
    if (provider === 'openrouter') {
      const res = await fetch(`${cfg.base}/key`, { headers: { authorization: `Bearer ${apiKey(provider)}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ...base, error: json?.error?.message ?? `returned ${res.status}` };
      const d = json.data ?? {};
      const credits = typeof d.limit === 'number' && typeof d.usage === 'number' ? d.limit - d.usage : null;
      return { ...base, ok: true, credits };
    }

    // Groq has no key-info endpoint; listing models proves the key works.
    const res = await fetch(`${cfg.base}/models`, { headers: { authorization: `Bearer ${apiKey(provider)}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ...base, error: json?.error?.message ?? `returned ${res.status}` };
    return { ...base, ok: true, models: Array.isArray(json.data) ? json.data.length : null };
  } catch (e) {
    return { ...base, error: (e as Error).message };
  }
}

/** Status for every provider, for the settings panel. */
export const verifyAll = (): Promise<KeyStatus[]> =>
  Promise.all((Object.keys(PROVIDERS) as Provider[]).map(verifyProvider));

/** Back-compat for callers that just want "is anything usable". */
export async function verifyKey(): Promise<{ ok: boolean; error?: string; credits?: number | null }> {
  const all = await verifyAll();
  const working = all.find((s) => s.ok);
  if (working) return { ok: true, credits: working.credits };
  const tried = all.find((s) => s.configured && s.error);
  return { ok: false, error: tried?.error ?? 'No provider key is set', credits: null };
}
