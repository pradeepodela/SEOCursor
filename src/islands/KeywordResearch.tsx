import { useState } from 'react';

const I = ({ d, s = 14 }: { d: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const P = {
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8',
  gauge: 'M12 21a9 9 0 1 0-9-9M12 12l5-3',
};

type Summary = { mode: string; found: number; created: number; updated: number; market: string };

const MODES = [
  { key: 'site', label: 'Keywords for this site', hint: 'Everything the provider associates with your domain — the widest net, and the usual starting point.' },
  { key: 'ranked', label: 'Where we already rank', hint: 'Terms your domain holds a position for right now, with that position attached.' },
  { key: 'seeds', label: 'Ideas from seed terms', hint: 'Related terms for words you supply. Use when you are exploring a topic the site does not cover yet.' },
] as const;

export default function KeywordResearch({
  siteId, market, keywordsWithoutDifficulty,
}: { siteId: string; market: string; keywordsWithoutDifficulty: number }) {
  const [mode, setMode] = useState<'site' | 'ranked' | 'seeds'>('site');
  const [seeds, setSeeds] = useState('');
  const [limit, setLimit] = useState(200);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Summary | null>(null);
  const [graded, setGraded] = useState<{ graded: number; checked: number } | null>(null);

  const active = MODES.find((m) => m.key === mode)!;

  async function run() {
    setBusy('research'); setError(null); setResult(null); setGraded(null);
    const r = await fetch('/api/keywords/research', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        siteId, mode, limit,
        seeds: mode === 'seeds' ? seeds.split(/[\n,]/).map((s) => s.trim()).filter(Boolean) : [],
      }),
    }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    setBusy(null);
    if (!r.ok) { setError(r.error ?? r.issues?.[0]?.message ?? 'Research failed'); return; }
    setResult(r.data);
    setTimeout(() => location.reload(), 1200);
  }

  async function grade() {
    setBusy('grade'); setError(null); setResult(null); setGraded(null);
    const r = await fetch('/api/keywords/enrich', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, limit: 300 }),
    }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    setBusy(null);
    if (!r.ok) { setError(r.error ?? 'Grading failed'); return; }
    setGraded(r.data);
    setTimeout(() => location.reload(), 1200);
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-head">
        <div>
          <div className="card-title">Keyword research</div>
          <div className="card-sub">DataForSEO · {market}</div>
        </div>
        {keywordsWithoutDifficulty > 0 && (
          <button className="btn" disabled={!!busy} onClick={grade}>
            {busy === 'grade' ? <><span className="spinner" />Grading…</> : <><I d={P.gauge} s={13} />Grade {keywordsWithoutDifficulty} ungraded</>}
          </button>
        )}
      </div>

      <div style={{ padding: '16px 18px' }}>
        <div className="filters" style={{ marginBottom: 14 }}>
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`filter ${mode === m.key ? 'on' : ''}`}
              onClick={() => setMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6, margin: '0 0 14px' }}>{active.hint}</p>

        {mode === 'seeds' && (
          <div className="field">
            <label className="field-label">Seed keywords</label>
            <textarea
              className="input"
              rows={3}
              placeholder={'gym management software\nmember retention\nfitness studio crm'}
              value={seeds}
              onChange={(e) => setSeeds(e.target.value)}
            />
            <p style={{ fontSize: 11.5, color: 'var(--ink-4)', margin: '6px 0 0' }}>One per line, or comma separated. Up to 20.</p>
          </div>
        )}

        <div className="field">
          <label className="field-label">How many keywords</label>
          <select className="input" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            <option value={50}>50 — a quick look</option>
            <option value={200}>200 — a good working set</option>
            <option value={500}>500</option>
            <option value={1000}>1000 — the maximum per call</option>
          </select>
        </div>

        <div className="row">
          <button
            className="btn btn-primary"
            disabled={!!busy || (mode === 'seeds' && !seeds.trim())}
            onClick={run}
          >
            {busy === 'research' ? <><span className="spinner" />Researching…</> : <><I d={P.search} s={13} />Run research</>}
          </button>
        </div>

        <p style={{ fontSize: 11.5, color: 'var(--ink-4)', margin: '12px 0 0', lineHeight: 1.6 }}>
          Each run is one billed API call regardless of how many keywords come back, so a larger set costs the same
          as a small one. Nothing runs on a schedule.
        </p>

        {result && (
          <p style={{ fontSize: 12.5, color: '#14532d', margin: '12px 0 0' }}>
            {result.found} keywords for {result.market} — {result.created} new, {result.updated} updated. Reloading…
          </p>
        )}
        {graded && (
          <p style={{ fontSize: 12.5, color: '#14532d', margin: '12px 0 0' }}>
            Graded {graded.graded} of {graded.checked} keywords. Reloading…
          </p>
        )}
        {error && <p style={{ fontSize: 12.5, color: '#b91c1c', margin: '12px 0 0', whiteSpace: 'pre-wrap' }}>{error}</p>}
      </div>
    </div>
  );
}
