import { useState } from 'react';

const I = ({ d, s = 14 }: { d: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const P = {
  check: 'M20 6 9 17l-5-5',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
  zap: 'M13 2 3 14h9l-1 8 10-12h-9z',
};

export type KeyStatus = {
  provider: string; label: string; env: string; keysUrl: string;
  configured: boolean; ok: boolean; error: string | null;
  credits: number | null; models: number | null;
};

export type ModelState = {
  providers: KeyStatus[];
  anyReady: boolean;
  ideaModel: string;
  draftModel: string;
  choices: { id: string; provider: string; label: string; note: string; tier: string }[];
};

export default function ModelPanel({ siteId, state }: { siteId: string; state: ModelState }) {
  const [s, setS] = useState(state);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = new Set(s.providers.filter((p) => p.ok).map((p) => p.provider));
  const usable = s.choices.filter((c) => ready.has(c.provider));

  async function save(field: 'ideaModel' | 'draftModel', value: string) {
    const prev = s[field];
    setS((p) => ({ ...p, [field]: value }));
    setBusy(true); setSaved(null); setError(null);
    const r = await fetch('/api/settings/models', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, [field]: value }),
    }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    setBusy(false);
    if (!r.ok) { setS((p) => ({ ...p, [field]: prev })); setError(r.error ?? 'Could not save'); return; }
    setSaved(field); setTimeout(() => setSaved(null), 2000);
  }

  const group = (list: typeof usable) => {
    const byProvider: Record<string, typeof usable> = {};
    for (const c of list) (byProvider[c.provider] ??= []).push(c);
    return byProvider;
  };
  const grouped = group(usable);
  const labelFor = (p: string) => s.providers.find((x) => x.provider === p)?.label ?? p;

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">AI models</div>
          <div className="card-sub">Groq for speed, OpenRouter for frontier models</div>
        </div>
        <span className={`badge ${s.anyReady ? 'green' : 'gray'}`}>
          {s.anyReady ? <><I d={P.check} s={11} />Ready</> : 'No key'}
        </span>
      </div>

      {/* provider status */}
      <div style={{ padding: '4px 0' }}>
        {s.providers.map((p) => (
          <div key={p.provider} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 18px', borderBottom: '1px solid var(--line-2)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 550, display: 'flex', alignItems: 'center', gap: 6 }}>
                {p.provider === 'groq' && <span style={{ color: 'var(--amber)' }}><I d={P.zap} s={12} /></span>}
                {p.label}
              </div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>
                {p.env}
                {p.ok && p.credits != null && ` · $${p.credits.toFixed(2)} left`}
                {p.ok && p.models != null && ` · ${p.models} models`}
              </div>
            </div>
            <span className={`badge ${p.ok ? 'green' : p.configured ? 'red' : 'gray'}`}>
              {p.ok ? 'Connected' : p.configured ? 'Key rejected' : 'Not set'}
            </span>
          </div>
        ))}
      </div>

      <div style={{ padding: '16px 18px' }}>
        {!s.anyReady ? (
          <>
            <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.65, margin: '0 0 12px' }}>
              Add at least one key to <span className="mono">.env</span>. You can set both — pick a cheap fast model
              for bulk titles and a stronger one for drafting.
            </p>
            <pre style={{ margin: '0 0 12px', fontFamily: 'var(--mono)', fontSize: 11.5, lineHeight: 1.7, background: 'var(--surface-sunk)', border: '1px solid var(--line)', borderRadius: 7, padding: '10px 12px', overflowX: 'auto' }}>
{`GROQ_API_KEY="gsk_..."            # console.groq.com/keys
OPENROUTER_API_KEY="sk-or-v1-..." # openrouter.ai/keys`}
            </pre>
            <p style={{ fontSize: 11.5, color: 'var(--ink-4)', margin: 0 }}>
              Save the file and refresh this page — no restart needed. Groq has a free tier and runs open models at around 1000 tokens
              a second, which is more than enough for generating titles.
            </p>
          </>
        ) : (
          <>
            <div className="field">
              <label className="field-label">Model for generating titles</label>
              <select className="input" value={s.ideaModel} disabled={busy} onChange={(e) => save('ideaModel', e.target.value)}>
                {Object.entries(grouped).map(([prov, list]) => (
                  <optgroup key={prov} label={labelFor(prov)}>
                    {list.map((c) => <option key={c.id} value={c.id}>{c.label} — {c.note.replace(/^[^·]+· /, '')}</option>)}
                  </optgroup>
                ))}
              </select>
              {saved === 'ideaModel' && <div style={{ fontSize: 11.5, color: 'var(--green)', marginTop: 5 }}>Saved.</div>}
            </div>

            <div className="field" style={{ marginBottom: 10 }}>
              <label className="field-label">Model for writing blog posts</label>
              <select className="input" value={s.draftModel} disabled={busy} onChange={(e) => save('draftModel', e.target.value)}>
                {Object.entries(grouped).map(([prov, list]) => (
                  <optgroup key={prov} label={labelFor(prov)}>
                    {list.map((c) => <option key={c.id} value={c.id}>{c.label} — {c.note.replace(/^[^·]+· /, '')}</option>)}
                  </optgroup>
                ))}
              </select>
              {saved === 'draftModel' && <div style={{ fontSize: 11.5, color: 'var(--green)', marginTop: 5 }}>Saved.</div>}
            </div>

            {!usable.some((c) => c.id === s.ideaModel) && (
              <div style={{ display: 'flex', gap: 9, padding: '10px 12px', background: 'var(--amber-soft)', border: '1px solid var(--amber-line)', borderRadius: 8, marginBottom: 10, fontSize: 12.5, color: '#92400e' }}>
                <I d={P.alert} s={14} />
                <span>The saved title model belongs to a provider with no working key. Pick another, or generation will fail.</span>
              </div>
            )}

            <div style={{ fontSize: 11.5, color: 'var(--ink-4)', lineHeight: 1.55 }}>
              Titles are cheap and benefit from speed; drafting is where quality and cost both land, so it is worth
              a stronger model there.
            </div>
          </>
        )}

        {error && (
          <div style={{ display: 'flex', gap: 9, padding: '10px 12px', background: 'var(--red-soft)', border: '1px solid var(--red-line)', borderRadius: 8, marginTop: 12, fontSize: 12.5, color: '#991b1b' }}>
            <I d={P.alert} s={14} /><span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
