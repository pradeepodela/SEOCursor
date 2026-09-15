import { useMemo, useState } from 'react';

export type Issue = {
  id: string; code: string; title: string; category: string; severity: string;
  affectedUrl: string | null; affectedCount: number; samples: string[];
  whyItMatters: string; recommendedAction: string; aiFixable: boolean; resolved: boolean;
  beforeText: string | null; afterText: string | null;
};

const I = ({ d, s = 14 }: { d: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const P = {
  x: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  spark: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
  wrench: 'M14.7 6.3a4 4 0 0 0 5 5l-9.5 9.5a2.1 2.1 0 0 1-3-3z',
};

const SEV_TONE: Record<string, string> = { CRITICAL: 'red', WARNING: 'amber', PASSED: 'green' };

export default function AuditBoard({ issues, siteId, passed }: { issues: Issue[]; siteId: string; passed: number }) {
  const [rows, setRows] = useState(issues);
  const [sev, setSev] = useState<string>('ALL');
  const [cat, setCat] = useState<string>('All');
  const [open, setOpen] = useState<Issue | null>(null);
  const [fixing, setFixing] = useState(false);
  const [fixed, setFixed] = useState<Record<string, boolean>>({});
  const [toasts, setToasts] = useState<{ id: string; text: string }[]>([]);

  const toast = (text: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  };

  const openRows = rows.filter((r) => !r.resolved);
  const critical = openRows.filter((r) => r.severity === 'CRITICAL').length;
  const warnings = openRows.filter((r) => r.severity === 'WARNING').length;

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(issues.map((i) => i.category)))],
    [issues],
  );

  const shown = useMemo(
    () => openRows.filter((r) => (sev === 'ALL' || r.severity === sev) && (cat === 'All' || r.category === cat)),
    [openRows, sev, cat],
  );

  async function fixIssue(issue: Issue) {
    setFixing(true);
    const res = await fetch('/api/issue', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: issue.id, resolved: true }),
    });
    const json = await res.json();
    setFixing(false);
    if (json.ok) {
      setRows((r) => r.map((x) => (x.id === issue.id ? { ...x, resolved: true } : x)));
      setFixed((f) => ({ ...f, [issue.id]: true }));
      setOpen(null);
      toast(`Marked fixed — ${issue.title}`);
    } else {
      toast(json.error ?? 'Could not apply the fix');
    }
  }

  return (
    <>
      <div className="audit-sum" style={{ marginBottom: 18 }}>
        {[
          { k: 'Critical', n: critical, sub: 'Fix these first', tone: 'var(--red)', key: 'CRITICAL' },
          { k: 'Warnings', n: warnings, sub: 'Worth scheduling', tone: 'var(--amber)', key: 'WARNING' },
          { k: 'Clean pages', n: passed, sub: 'No defects found', tone: 'var(--green)', key: 'PASSED' },
        ].map((c) => (
          <div
            key={c.k}
            className={`audit-card ${sev === c.key ? 'on' : ''}`}
            onClick={() => setSev(c.key === 'PASSED' ? 'ALL' : sev === c.key ? 'ALL' : c.key)}
          >
            <div className="audit-n" style={{ color: c.tone }}>{c.n}</div>
            <div className="audit-k">{c.k}</div>
            <div className="audit-sub">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap' }}>
          <div>
            <div className="card-title">Issues</div>
            <div className="card-sub">{shown.length} shown · grouped by what they cost you, not by count.</div>
          </div>
          <div className="filters">
            {categories.map((c) => (
              <button key={c} className={`filter ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>
                {c}
                {c !== 'All' && <span className="filter-n">{openRows.filter((r) => r.category === c).length}</span>}
              </button>
            ))}
          </div>
        </div>

        <div>
          {shown.length === 0 && (
            <div className="empty"><div className="empty-icon">✓</div>No open issues in this view.</div>
          )}
          {shown.map((it) => (
            <div className="issue" key={it.id} onClick={() => setOpen(it)}>
              <div className="issue-top">
                <span className={`dot sev-${it.severity}`} />
                <span className="issue-title">{it.title}</span>
                <span className={`badge ${SEV_TONE[it.severity]}`}>{it.severity[0] + it.severity.slice(1).toLowerCase()}</span>
                <span className="badge gray">{it.category}</span>
              </div>
              {it.affectedUrl && <div className="issue-url">{it.affectedUrl}</div>}
              <div className="issue-why">{it.whyItMatters}</div>
              {it.samples.length > 0 && (
                <div style={{ marginTop: 7, fontSize: 11.5, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}>
                  {it.samples[0].slice(0, 110)}{it.samples.length > 1 ? ` · +${it.samples.length - 1} more` : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {open && (
        <>
          <div className="scrim" onClick={() => !fixing && setOpen(null)} />
          <aside className="drawer">
            <div className="drawer-head">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 7, marginBottom: 7 }}>
                  <span className={`badge ${SEV_TONE[open.severity]}`}>{open.severity[0] + open.severity.slice(1).toLowerCase()}</span>
                  <span className="badge gray">{open.category}</span>
                </div>
                <h2 className="h2">{open.title}</h2>
                {open.affectedUrl && <div className="mono" style={{ fontSize: 12.5, color: 'var(--blue)', marginTop: 5 }}>{open.affectedUrl}</div>}
              </div>
              <button className="x-btn" onClick={() => !fixing && setOpen(null)}><I d={P.x} /></button>
            </div>

            <div className="drawer-body">
              <Block title="Why it matters">{open.whyItMatters}</Block>
              <Block title="Recommended action">{open.recommendedAction}</Block>

              {open.samples.length > 0 && (
                <>
                  <h3 style={{ fontSize: 13, fontWeight: 620, margin: '0 0 8px' }}>
                    Affected {open.affectedCount > open.samples.length ? `(showing ${open.samples.length} of ${open.affectedCount})` : `(${open.affectedCount})`}
                  </h3>
                  <div style={{ border: '1px solid var(--line)', borderRadius: 9, overflow: 'hidden', marginBottom: 20 }}>
                    {open.samples.map((sample, i) => (
                      <div
                        key={i}
                        className="mono"
                        style={{
                          fontSize: 11.5, padding: '9px 12px', lineHeight: 1.5, wordBreak: 'break-all',
                          borderBottom: i < open.samples.length - 1 ? '1px solid var(--line-2)' : 'none',
                          background: i % 2 ? 'var(--surface-2)' : 'var(--surface)',
                        }}
                      >
                        {sample}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {fixing && (
                <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--ink-3)' }}>
                  <span className="spinner" style={{ color: 'var(--blue)' }} />
                  Applying the change and re-validating…
                </div>
              )}
            </div>

            <div className="drawer-foot">
              <button className="btn btn-primary" disabled={fixing} onClick={() => fixIssue(open)}>
                <I d={P.check} s={13} />{fixing ? 'Saving…' : 'Mark as fixed'}
              </button>
              <div className="spacer" />
              <span className="muted" style={{ fontSize: 11.5 }}>
                Re-crawl to verify — findings are regenerated from what is live.
              </span>
            </div>
          </aside>
        </>
      )}

      {toasts.length > 0 && (
        <div className="toasts">
          {toasts.map((t) => <div className="toast" key={t.id}><I d={P.check} s={15} /><span>{t.text}</span></div>)}
        </div>
      )}
    </>
  );
}

const Block = ({ title, children }: { title: string; children: any }) => (
  <div style={{ marginBottom: 20 }}>
    <h3 style={{ fontSize: 13, fontWeight: 620, margin: '0 0 6px' }}>{title}</h3>
    <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6, margin: 0 }}>{children}</p>
  </div>
);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
