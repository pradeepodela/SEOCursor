import { useState } from 'react';

const I = ({ d, s = 14 }: { d: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const P = {
  check: 'M20 6 9 17l-5-5',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
};

export type GscState = {
  configured: boolean;
  connected: boolean;
  googleEmail: string | null;
  propertyUrl: string | null;
  properties: string[];
  lastSyncAt: string | null;
  syncError: string | null;
  redirectUri: string;
};

export default function GscPanel({ siteId, state, notice }: { siteId: string; state: GscState; notice?: string | null }) {
  const [s, setS] = useState(state);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(90);

  async function selectProperty(propertyUrl: string) {
    setBusy('property'); setError(null);
    const r = await fetch('/api/google/property', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, propertyUrl }),
    }).then((x) => x.json());
    setBusy(null);
    if (r.ok) setS((p) => ({ ...p, propertyUrl: r.data.propertyUrl }));
    else setError(r.error);
  }

  async function sync() {
    setBusy('sync'); setError(null); setResult(null);
    const r = await fetch('/api/google/sync', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, days }),
    }).then((x) => x.json());
    setBusy(null);
    if (r.ok) {
      setResult(r.data);
      setS((p) => ({ ...p, lastSyncAt: new Date().toISOString(), syncError: null }));
    } else setError(r.error);
  }

  async function disconnect() {
    if (!confirm('Disconnect Search Console? Ranking and impression data will be removed from this workspace.')) return;
    setBusy('disconnect'); setError(null);
    const r = await fetch('/api/google/disconnect', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, confirm: true }),
    }).then((x) => x.json());
    setBusy(null);
    if (r.ok) setS((p) => ({ ...p, connected: false, propertyUrl: null, properties: [], googleEmail: null, lastSyncAt: null }));
    else setError(r.error);
  }

  // ------------------------------------------------------------ not configured
  if (!s.configured) {
    return (
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Google Search Console</div>
            <div className="card-sub">Not configured yet</div>
          </div>
          <span className="badge gray">Setup needed</span>
        </div>
        <div style={{ padding: '16px 18px' }}>
          <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.65, margin: '0 0 14px' }}>
            Search Console is what tells you which pages actually rank and for what. The crawl can see what exists
            on your site; only Google can tell you what it earns. Connecting it needs OAuth credentials from a
            Google Cloud project — a one-off, five-minute job.
          </p>
          <ol style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.8, paddingLeft: 20, margin: '0 0 14px' }}>
            <li>Create a project at <span className="mono">console.cloud.google.com</span></li>
            <li>Enable the <strong>Google Search Console API</strong></li>
            <li>Configure the OAuth consent screen (External, add yourself as a test user)</li>
            <li>Create an <strong>OAuth client ID</strong> of type <em>Web application</em></li>
            <li>Add this exact authorised redirect URI:</li>
          </ol>
          <div className="mono" style={{ fontSize: 11.5, background: 'var(--surface-sunk)', border: '1px solid var(--line)', borderRadius: 7, padding: '8px 10px', marginBottom: 14, wordBreak: 'break-all' }}>
            {s.redirectUri}
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: '0 0 8px' }}>Then add the credentials to <span className="mono">.env</span>:</p>
          <pre style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: 11.5, lineHeight: 1.7, background: 'var(--surface-sunk)', border: '1px solid var(--line)', borderRadius: 7, padding: '10px 12px', overflowX: 'auto' }}>
{`GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-..."
GOOGLE_REDIRECT_URI="${s.redirectUri}"`}
          </pre>
          <p style={{ fontSize: 11.5, color: 'var(--ink-4)', margin: '12px 0 0' }}>
            Save the file and refresh this page — no restart needed. We request read-only scope and never write to your Google account.
          </p>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------ not connected
  if (!s.connected) {
    return (
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Google Search Console</div>
            <div className="card-sub">Ready to connect</div>
          </div>
          <span className="badge amber">Not connected</span>
        </div>
        <div style={{ padding: '16px 18px' }}>
          <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.65, margin: '0 0 14px' }}>
            Connect the Google account that owns this property. We ask for read-only access to Search Console
            and nothing else.
          </p>
          {notice === 'error' && (
            <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: 'var(--red-soft)', border: '1px solid var(--red-line)', borderRadius: 8, marginBottom: 14, fontSize: 12.5, color: '#991b1b' }}>
              <I d={P.alert} s={14} />
              <span>Authorisation failed. If you saw a consent screen, make sure your Google account is added as a test user on the OAuth consent screen.</span>
            </div>
          )}
          <a className="btn btn-primary" href={`/api/google/auth?site=${siteId}`}>
            <I d={P.link} s={13} />Connect Search Console
          </a>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------ connected
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Google Search Console</div>
          <div className="card-sub">{s.googleEmail ?? 'Connected'}</div>
        </div>
        <span className="badge green"><I d={P.check} s={11} />Connected</span>
      </div>

      <div style={{ padding: '16px 18px' }}>
        {s.properties.length > 0 && (
          <div className="field">
            <label className="field-label">Property</label>
            <select
              className="input mono"
              value={s.propertyUrl ?? ''}
              disabled={busy === 'property'}
              onChange={(e) => selectProperty(e.target.value)}
            >
              <option value="" disabled>Select a property…</option>
              {s.properties.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {!s.propertyUrl && (
              <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 6 }}>
                We could not match a property to this domain automatically — pick the right one.
              </div>
            )}
          </div>
        )}

        <div className="field">
          <label className="field-label">Date range</label>
          <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={28}>Last 28 days</option>
            <option value={90}>Last 3 months</option>
            <option value={180}>Last 6 months</option>
            <option value={365}>Last 12 months</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <button className="btn btn-primary" disabled={!s.propertyUrl || !!busy} onClick={sync}>
            {busy === 'sync' ? <><span className="spinner" />Pulling data…</> : <><I d={P.refresh} s={13} />Sync performance data</>}
          </button>
          <button className="btn" disabled={!!busy} onClick={disconnect}>Disconnect</button>
        </div>

        {s.lastSyncAt && !result && (
          <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 10 }}>
            Last synced {new Date(s.lastSyncAt).toLocaleString()}
          </div>
        )}

        {(error || s.syncError) && (
          <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: 'var(--red-soft)', border: '1px solid var(--red-line)', borderRadius: 8, marginTop: 14, fontSize: 12.5, color: '#991b1b' }}>
            <I d={P.alert} s={14} />
            <span>{error ?? s.syncError}</span>
          </div>
        )}

        {result && (
          <>
            <div className="meta-grid" style={{ marginTop: 16 }}>
              <div className="meta-cell"><div className="meta-k">Clicks</div><div className="meta-v">{result.clicks.toLocaleString()}</div></div>
              <div className="meta-cell"><div className="meta-k">Impressions</div><div className="meta-v">{result.impressions.toLocaleString()}</div></div>
              <div className="meta-cell"><div className="meta-k">Keywords</div><div className="meta-v">{result.keywords.toLocaleString()}</div></div>
              <div className="meta-cell"><div className="meta-k">Pages in GSC</div><div className="meta-v">{result.pagesInGsc}</div></div>
              <div className="meta-cell"><div className="meta-k">Matched to crawl</div><div className="meta-v">{result.pagesMatchedToCrawl}</div></div>
            </div>
            {result.pagesInGsc > result.pagesMatchedToCrawl && (
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 10, lineHeight: 1.55 }}>
                {result.pagesInGsc - result.pagesMatchedToCrawl} URLs get impressions but were not reached by the crawl —
                usually because they sit past the page limit or are not linked from anywhere. Raising the crawl cap will pick them up.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <a className="btn btn-sm btn-primary" href={`/keywords?site=${siteId}`}>See what ranks</a>
              <a className="btn btn-sm" href={`/pages?site=${siteId}`}>See page performance</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
