import { useEffect, useState } from 'react';

const I = ({ d, s = 14 }: { d: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const P = {
  check: 'M20 6 9 17l-5-5',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
};

type Language = { code: string; name: string };
type Location = { locationCode: number; locationName: string; countryIso: string; languages: Language[] };

export type KeywordProviderState = {
  configured: boolean;
  connected: boolean;
  locationCode: number | null;
  locationName: string | null;
  languageCode: string | null;
  languageName: string | null;
  balanceUsd: number | null;
  lastResearchAt: string | null;
  keywordsPulled: number;
  lastError: string | null;
};

export default function KeywordPanel({ siteId, state }: { siteId: string; state: KeywordProviderState }) {
  const [s, setS] = useState(state);
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [locationCode, setLocationCode] = useState<number | null>(state.locationCode);
  const [languageCode, setLanguageCode] = useState<string | null>(state.languageCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  // The market list is the first thing to hit a closed account, so a failure
  // here means nothing else on this card can work either.
  const [blocked, setBlocked] = useState<string | null>(null);

  // The market list is the provider's own and free to fetch, so it is pulled
  // once the panel is on screen rather than baked into the page.
  useEffect(() => {
    if (!s.configured || locations) return;
    setLoadingLocations(true);
    fetch('/api/keywords/locations')
      .then((r) => r.json())
      .then((r) => { if (r.ok) setLocations(r.data.locations); else setBlocked(r.error); })
      .catch((e) => setBlocked(e.message))
      .finally(() => setLoadingLocations(false));
  }, [s.configured, locations]);

  const location = locations?.find((l) => l.locationCode === locationCode) ?? null;
  const languages = location?.languages ?? [];

  // Keep the language valid for whichever country is selected.
  useEffect(() => {
    if (!location) return;
    if (!languages.some((l) => l.code === languageCode)) {
      setLanguageCode(languages.find((l) => l.code === 'en')?.code ?? languages[0]?.code ?? null);
    }
  }, [locationCode, locations]);

  async function save() {
    if (!location || !languageCode) return;
    const language = languages.find((l) => l.code === languageCode);
    setBusy(true); setError(null); setSaved(null);
    const r = await fetch('/api/keywords/connect', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        siteId,
        locationCode: location.locationCode,
        locationName: location.locationName,
        languageCode,
        languageName: language?.name ?? languageCode,
      }),
    }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    setBusy(false);
    if (!r.ok) { setError(r.error ?? r.issues?.[0]?.message ?? 'Could not save'); return; }
    setS({
      ...s, connected: true,
      locationCode: location.locationCode, locationName: location.locationName,
      languageCode, languageName: language?.name ?? languageCode,
      balanceUsd: r.data.balanceUsd ?? null, lastError: null,
    });
    setSaved(`${r.data.locationName} · ${r.data.languageName}`);
  }

  async function disconnect() {
    if (!confirm('Disconnect the keyword provider? Keywords already pulled are kept.')) return;
    setBusy(true);
    const r = await fetch('/api/keywords/connect', {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, confirm: true }),
    }).then((x) => x.json());
    setBusy(false);
    if (r.ok) setS({ ...s, connected: false, locationCode: null, locationName: null, languageCode: null, languageName: null });
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Keyword provider</div>
          <div className="card-sub">
            {s.connected ? `DataForSEO · ${s.locationName} · ${s.languageName}` : 'Search volume and difficulty'}
          </div>
        </div>
        <span className={`badge ${s.connected && !blocked ? 'green' : blocked ? 'gray' : s.configured ? 'amber' : 'gray'}`}>
          {blocked ? 'Account not verified'
            : s.connected ? <><I d={P.check} s={11} />Connected</>
            : s.configured ? 'Pick a market' : 'No credentials'}
        </span>
      </div>

      <div style={{ padding: '16px 18px' }}>
        {!s.configured ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.65, margin: '0 0 12px' }}>
              Search Console shows what this site already earns. It cannot show demand for terms you have never
              ranked for, or how hard any of them are to win. DataForSEO fills that in.
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: '0 0 8px' }}>
              Get API credentials from <span className="mono">app.dataforseo.com/api-access</span> and add them to{' '}
              <span className="mono">.env</span>:
            </p>
            <pre style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: 11.5, lineHeight: 1.7, background: 'var(--surface-sunk)', border: '1px solid var(--line)', borderRadius: 7, padding: '10px 12px', overflowX: 'auto' }}>
{`DATAFORSEO_LOGIN="you@example.com"
DATAFORSEO_PASSWORD="..."`}
            </pre>
            <p style={{ fontSize: 11.5, color: 'var(--ink-4)', margin: '12px 0 0' }}>
              Save the file and refresh this page — no restart needed. Every research call is billed, so nothing
              here runs on its own; you choose when to pull.
            </p>
          </>
        ) : blocked ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.65, margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>
              {blocked}
            </p>
            <a className="btn btn-primary" href="https://app.dataforseo.com/" target="_blank" rel="noreferrer">
              <I d={P.link} s={13} />Open the DataForSEO panel
            </a>
            <p style={{ fontSize: 11.5, color: 'var(--ink-4)', margin: '12px 0 0' }}>
              Nothing needs changing here — refresh this page once the account clears.
            </p>
          </>
        ) : (
          <>
            <div className="field">
              <label className="field-label">Country</label>
              <select
                className="input"
                value={locationCode ?? ''}
                disabled={loadingLocations || !locations}
                onChange={(e) => setLocationCode(Number(e.target.value) || null)}
              >
                <option value="">{loadingLocations ? 'Loading markets…' : 'Select a country'}</option>
                {(locations ?? []).map((l) => (
                  <option key={l.locationCode} value={l.locationCode}>{l.locationName}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field-label">Language</label>
              <select
                className="input"
                value={languageCode ?? ''}
                disabled={!location}
                onChange={(e) => setLanguageCode(e.target.value || null)}
              >
                {!location && <option value="">Pick a country first</option>}
                {languages.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </div>

            <p style={{ fontSize: 11.5, color: 'var(--ink-4)', margin: '0 0 14px', lineHeight: 1.6 }}>
              Volume and difficulty are per market — the same keyword is a different opportunity in each. Change it
              any time; existing keywords keep the numbers they were measured with.
            </p>

            <div className="row">
              <button className="btn btn-primary" disabled={busy || !location || !languageCode} onClick={save}>
                {busy ? <><span className="spinner" />Verifying…</> : <><I d={P.link} s={13} />{s.connected ? 'Update market' : 'Connect and verify'}</>}
              </button>
              {s.connected && <button className="btn" disabled={busy} onClick={disconnect}>Disconnect</button>}
            </div>

            {saved && (
              <p style={{ fontSize: 12.5, color: 'var(--green-ink, #14532d)', margin: '12px 0 0' }}>
                Market set to {saved}.{s.balanceUsd != null && ` Account balance $${s.balanceUsd.toFixed(2)}.`}
              </p>
            )}
            {s.connected && !saved && (
              <p style={{ fontSize: 11.5, color: 'var(--ink-4)', margin: '12px 0 0' }}>
                {s.keywordsPulled} keywords pulled
                {s.lastResearchAt && ` · last ${new Date(s.lastResearchAt).toLocaleDateString()}`}
                {s.balanceUsd != null && ` · balance $${s.balanceUsd.toFixed(2)}`}
              </p>
            )}
            {error && <p style={{ fontSize: 12.5, color: 'var(--red-ink, #b91c1c)', margin: '12px 0 0', whiteSpace: 'pre-wrap' }}>{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
