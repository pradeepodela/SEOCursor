import { useState } from 'react';

export type Rec = {
  id: string; order: number; title: string; detail: string; impact: string;
  beforeText: string | null; afterText: string | null; applied: boolean;
};

const I = ({ d, s = 14 }: { d: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const P = {
  check: 'M20 6 9 17l-5-5',
  spark: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  chevron: 'M6 9l6 6 6-6',
};

export default function PageRecs({ recs: initial, pageUrl }: { recs: Rec[]; pageUrl: string }) {
  const [recs, setRecs] = useState(initial);
  const [expanded, setExpanded] = useState<string | null>(initial.find((r) => r.beforeText)?.id ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: string; text: string }[]>([]);

  const toast = (text: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  };

  async function apply(rec: Rec) {
    setBusy(rec.id);
    await wait(900);
    const res = await fetch('/api/recommendation', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: rec.id, applied: true }),
    });
    const json = await res.json();
    setBusy(null);
    if (json.ok) {
      setRecs((rs) => rs.map((r) => (r.id === rec.id ? { ...r, applied: true } : r)));
      toast(`Applied to ${pageUrl} — ${rec.title}`);
    } else toast(json.error ?? 'Could not apply');
  }

  async function applyAll() {
    const pending = recs.filter((r) => !r.applied);
    for (const r of pending) await apply(r);
  }

  const pending = recs.filter((r) => !r.applied).length;

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">AI Recommendations</div>
            <div className="card-sub">{pending ? `${pending} pending · ordered by expected lift` : 'All applied'}</div>
          </div>
          {pending > 0 && (
            <button className="btn btn-sm btn-ai" onClick={applyAll} disabled={!!busy}>
              <I d={P.spark} s={12} />Apply all
            </button>
          )}
        </div>

        <div>
          {recs.map((r, i) => (
            <div key={r.id} style={{ borderBottom: i < recs.length - 1 ? '1px solid var(--line-2)' : 'none' }}>
              <div
                style={{ display: 'flex', gap: 12, padding: '13px 18px', cursor: 'pointer', alignItems: 'flex-start' }}
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              >
                <span className="opp-rank" style={{ marginTop: 1 }}>{r.applied ? <I d={P.check} s={12} /> : i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 550, textDecoration: r.applied ? 'line-through' : 'none', color: r.applied ? 'var(--ink-4)' : 'inherit' }}>
                      {r.title}
                    </span>
                    <span className={`badge ${r.impact === 'HIGH' ? 'red' : r.impact === 'MEDIUM' ? 'amber' : 'gray'}`}>
                      {r.impact[0] + r.impact.slice(1).toLowerCase()}
                    </span>
                    {r.applied && <span className="badge green">Applied</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 5, lineHeight: 1.55 }}>{r.detail}</div>
                </div>
                <span style={{ color: 'var(--ink-4)', transform: expanded === r.id ? 'rotate(180deg)' : 'none', transition: 'transform .18s', marginTop: 3 }}>
                  <I d={P.chevron} s={14} />
                </span>
              </div>

              {expanded === r.id && (
                <div style={{ padding: '0 18px 16px 52px' }} className="anim-in">
                  {r.beforeText && r.afterText ? (
                    <div className="diff">
                      <div className="diff-side before"><div className="diff-tag">Current</div>{r.beforeText}</div>
                      <div className="diff-side after"><div className="diff-tag">Proposed</div>{r.afterText}</div>
                    </div>
                  ) : (
                    <div className="insight" style={{ margin: 0 }}>
                      <div className="insight-tag"><I d={P.spark} s={11} />No preview available</div>
                      <div className="insight-body">
                        This change touches multiple places on the page, so there is no single before/after to show.
                        Applying it queues the edits for review in your CMS.
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    {!r.applied && (
                      <button className="btn btn-sm btn-primary" disabled={busy === r.id} onClick={() => apply(r)}>
                        {busy === r.id ? <><span className="spinner" />Applying…</> : <><I d={P.check} s={12} />Apply</>}
                      </button>
                    )}
                    <button className="btn btn-sm" data-ask={`Why does "${r.title}" matter for ${pageUrl}?`}>Ask AI why</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {recs.length === 0 && <div className="empty">No recommendations for this page — it is performing as expected.</div>}
        </div>
      </div>

      {toasts.length > 0 && (
        <div className="toasts">
          {toasts.map((t) => <div className="toast" key={t.id}><I d={P.check} s={15} /><span>{t.text}</span></div>)}
        </div>
      )}
    </>
  );
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
