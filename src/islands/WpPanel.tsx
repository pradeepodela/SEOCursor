import { useState } from 'react';

const I = ({ d, s = 14 }: { d: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const P = {
  check: 'M20 6 9 17l-5-5',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
};

export type WpState = {
  connected: boolean;
  baseUrl: string | null;
  username: string | null;
  defaultStatus: string;
  verifiedAt: string | null;
  lastError: string | null;
};

export default function WpPanel({ siteId, state }: { siteId: string; state: WpState }) {
  const [s, setS] = useState(state);
  const [baseUrl, setBaseUrl] = useState(state.baseUrl ?? '');
  const [username, setUsername] = useState(state.username ?? '');
  const [appPassword, setAppPassword] = useState('');
  const [defaultStatus, setDefaultStatus] = useState(state.defaultStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [showForm, setShowForm] = useState(!state.connected);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setResult(null);
    const r = await fetch('/api/wordpress/connect', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, baseUrl, username, appPassword, defaultStatus }),
    }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    setBusy(false);
    if (!r.ok) { setError(r.error ?? r.issues?.[0]?.message ?? 'Could not connect'); return; }
    setResult(r.data);
    setS({ connected: true, baseUrl, username, defaultStatus, verifiedAt: new Date().toISOString(), lastError: null });
    setAppPassword('');
    setShowForm(false);
  }

  async function disconnect() {
    if (!confirm('Disconnect WordPress? Scheduled auto-publishing will be turned off.')) return;
    setBusy(true);
    const r = await fetch('/api/wordpress/connect', {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, confirm: true }),
    }).then((x) => x.json());
    setBusy(false);
    if (r.ok) { setS({ connected: false, baseUrl: null, username: null, defaultStatus: 'draft', verifiedAt: null, lastError: null }); setShowForm(true); setResult(null); }
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">WordPress</div>
          <div className="card-sub">{s.connected ? `${s.username} at ${s.baseUrl}` : 'Where published posts go'}</div>
        </div>
        <span className={`badge ${s.connected ? 'green' : 'gray'}`}>
          {s.connected ? <><I d={P.check} s={11} />Connected</> : 'Not connected'}
        </span>
      </div>

      <div style={{ padding: '16px 18px' }}>
        {!showForm && s.connected ? (
          <>
            <div className="meta-grid" style={{ marginBottom: 14 }}>
              <div className="meta-cell"><div className="meta-k">Site</div><div className="meta-v mono" style={{ fontSize: 11.5 }}>{s.baseUrl}</div></div>
              <div className="meta-cell"><div className="meta-k">User</div><div className="meta-v" style={{ fontSize: 13 }}>{s.username}</div></div>
              <div className="meta-cell"><div className="meta-k">Default</div><div className="meta-v" style={{ fontSize: 13 }}>{s.defaultStatus}</div></div>
            </div>
            {result?.categories?.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 12 }}>
                {result.categories.length} categories found on that site.
              </div>
            )}
            <div className="row">
              <button className="btn" onClick={() => setShowForm(true)}>Change credentials</button>
              <button className="btn" disabled={busy} onClick={disconnect}>Disconnect</button>
            </div>
          </>
        ) : (
          <form onSubmit={connect}>
            <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.65, margin: '0 0 14px' }}>
              Use a WordPress <strong>application password</strong>, not your account password. In WordPress go to
              <span className="mono"> Users → Profile → Application Passwords</span>, create one named "SEO Cursor",
              and paste it below. It can be revoked from there at any time without changing your login.
            </p>

            <div className="field">
              <label className="field-label">WordPress site URL</label>
              <input className="input mono" placeholder="https://yourblog.com" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required />
            </div>
            <div className="field">
              <label className="field-label">Username</label>
              <input className="input" placeholder="your WordPress username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div className="field">
              <label className="field-label">Application password</label>
              <input className="input mono" type="password" placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" value={appPassword} onChange={(e) => setAppPassword(e.target.value)} required />
            </div>
            <div className="field">
              <label className="field-label">Default status for new posts</label>
              <select className="input" value={defaultStatus} onChange={(e) => setDefaultStatus(e.target.value)}>
                <option value="draft">Draft — review in WordPress before it goes live</option>
                <option value="publish">Publish immediately</option>
                <option value="pending">Pending review</option>
              </select>
            </div>

            <div className="row">
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? <><span className="spinner" />Verifying…</> : <><I d={P.link} s={13} />Connect and verify</>}
              </button>
              {s.connected && <button className="btn" type="button" onClick={() => setShowForm(false)}>Cancel</button>}
            </div>
          </form>
        )}

        {result && (
          <div style={{ display: 'flex', gap: 9, padding: '10px 12px', background: 'var(--green-soft)', border: '1px solid var(--green-line)', borderRadius: 8, marginTop: 14, fontSize: 12.5, color: '#14532d' }}>
            <I d={P.check} s={14} />
            <span>Connected to <strong>{result.siteName ?? 'WordPress'}</strong> as {result.user}. Publishing is available.</span>
          </div>
        )}

        {(error || s.lastError) && (
          <div style={{ display: 'flex', gap: 9, padding: '10px 12px', background: 'var(--red-soft)', border: '1px solid var(--red-line)', borderRadius: 8, marginTop: 14, fontSize: 12.5, color: '#991b1b' }}>
            <I d={P.alert} s={14} /><span>{error ?? s.lastError}</span>
          </div>
        )}
      </div>
    </div>
  );
}
