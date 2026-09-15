import { useState } from 'react';

const I = ({ d, s = 14 }: { d: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const P = {
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  rocket: 'M5 3l14 9-14 9z',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
  copy: 'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
};

export type Doc = {
  id: string; title: string; slug: string; status: string; body: string; html: string;
  wordCount: number; seoScore: number; targetKeyword: string | null; excerpt: string | null;
  model: string | null; costUsd: number | null;
  wpUrl: string | null; wpPostId: number | null; wpStatus: string | null; publishError: string | null;
  publishedAt: string | null; createdAt: string;
};

const STATUS_TONE: Record<string, string> = { DRAFT: 'gray', SCHEDULED: 'amber', PUBLISHED: 'green', UPDATE: 'violet' };

export default function Studio({ docs: initial, siteId, wpReady, initialDoc }: { docs: Doc[]; siteId: string; wpReady: boolean; initialDoc?: string }) {
  const [docs, setDocs] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(
    initial.find((d) => d.id === initialDoc)?.id ?? initial[0]?.id ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<'publish' | 'draft' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: string; text: string }[]>([]);

  const doc = docs.find((d) => d.id === activeId) ?? null;

  const toast = (text: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  };

  async function publish(status: 'publish' | 'draft') {
    if (!doc) return;
    setBusy(true); setError(null);
    const r = await fetch('/api/blog/publish', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contentId: doc.id, status, confirm: true }),
    }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    setBusy(false); setConfirming(null);
    if (!r.ok) { setError(r.error); return; }
    setDocs((ds) => ds.map((d) => (d.id === doc.id
      ? { ...d, wpUrl: r.data.url, wpPostId: r.data.wpPostId, wpStatus: r.data.status, status: status === 'publish' ? 'PUBLISHED' : d.status, publishError: null }
      : d)));
    toast(status === 'publish' ? 'Published to WordPress' : 'Saved as a WordPress draft');
  }

  async function copyMarkdown() {
    if (!doc) return;
    try { await navigator.clipboard.writeText(doc.body); toast('Markdown copied'); }
    catch { toast('Could not access the clipboard'); }
  }

  return (
    <div className="studio">
      <aside className="studio-rail">
        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-4)', padding: '0 9px 8px' }}>
          Drafts ({docs.length})
        </div>
        {docs.map((d) => (
          <div
            key={d.id}
            className={`tree-item ${activeId === d.id ? 'on' : ''}`}
            style={{ fontSize: 12.5, alignItems: 'flex-start', lineHeight: 1.4 }}
            onClick={() => { setActiveId(d.id); setError(null); setConfirming(null); }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>
                {d.wordCount.toLocaleString()}w{d.wpUrl ? ' · live' : ''}
              </span>
            </span>
          </div>
        ))}
        {docs.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-4)', padding: '8px 9px' }}>Nothing written yet.</div>}
      </aside>

      <main className="studio-main">
        {!doc && (
          <div className="empty" style={{ paddingTop: 80 }}>
            <div className="empty-icon">✎</div>
            No drafts yet. Generate one from a blog idea.
            <div style={{ marginTop: 14 }}><a className="btn btn-primary btn-sm" href={`/ideas?site=${siteId}`}>Go to ideas</a></div>
          </div>
        )}

        {doc && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className={`badge ${STATUS_TONE[doc.status] ?? 'gray'}`}>{doc.status[0] + doc.status.slice(1).toLowerCase()}</span>
              <span className="badge gray">{doc.wordCount.toLocaleString()} words</span>
              <span className={`badge ${doc.seoScore >= 80 ? 'green' : 'blue'}`}>SEO {doc.seoScore}/100</span>
              {doc.targetKeyword && <span className="badge violet">{doc.targetKeyword}</span>}
              {doc.wpUrl && <span className="badge green"><I d={P.check} s={10} />Live on WordPress</span>}
              <div className="spacer" />
              {doc.model && (
                <span style={{ fontSize: 11, color: 'var(--ink-4)' }} className="mono">
                  {doc.model}{doc.costUsd != null ? ` · $${doc.costUsd.toFixed(4)}` : ''}
                </span>
              )}
            </div>

            {doc.excerpt && (
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.6, padding: '11px 13px', background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 9, marginBottom: 22 }}>
                <strong style={{ color: 'var(--ink-2)', fontWeight: 600 }}>Meta description. </strong>{doc.excerpt}
              </div>
            )}

            <div className="doc">
              <h1>{doc.title}</h1>
              <div dangerouslySetInnerHTML={{ __html: doc.html }} />
            </div>

            {(error || doc.publishError) && (
              <div style={{ display: 'flex', gap: 9, padding: '11px 13px', background: 'var(--red-soft)', border: '1px solid var(--red-line)', borderRadius: 8, marginTop: 24, fontSize: 12.5, color: '#991b1b' }}>
                <I d={P.alert} s={14} /><span>{error ?? doc.publishError}</span>
              </div>
            )}

            <div style={{ position: 'sticky', bottom: 0, background: 'linear-gradient(transparent, var(--surface) 24%)', paddingTop: 26, marginTop: 30 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 12, borderTop: '1px solid var(--line-2)', paddingTop: 14 }}>
                <button className="btn" onClick={copyMarkdown}><I d={P.copy} s={13} />Copy Markdown</button>
                <div className="spacer" />
                {doc.wpUrl && <a className="btn" href={doc.wpUrl} target="_blank" rel="noreferrer">View live post</a>}
                {wpReady && (
                  <>
                    <button className="btn" disabled={busy} onClick={() => setConfirming('draft')}>Send as WP draft</button>
                    <button className="btn btn-primary" disabled={busy} onClick={() => setConfirming('publish')}>
                      <I d={P.rocket} s={13} />{doc.wpUrl ? 'Update live post' : 'Publish'}
                    </button>
                  </>
                )}
                {!wpReady && (
                  <a className="btn btn-primary" href={`/settings?site=${siteId}`}>Connect WordPress to publish</a>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {confirming && doc && (
        <>
          <div className="scrim" onClick={() => !busy && setConfirming(null)} />
          <div className="modal" style={{ width: 'min(440px, 94vw)' }}>
            <div className="drawer-head">
              <div style={{ flex: 1 }}>
                <h2 className="h2">{confirming === 'publish' ? 'Publish to your live site?' : 'Send to WordPress as a draft?'}</h2>
                <p className="sub" style={{ fontSize: 13 }}>
                  {confirming === 'publish'
                    ? 'This makes the post publicly visible and crawlable.'
                    : 'It will appear in your WordPress drafts for review.'}
                </p>
              </div>
              <button className="x-btn" onClick={() => !busy && setConfirming(null)}><I d={P.x} /></button>
            </div>
            <div className="drawer-body" style={{ padding: 20 }}>
              <div className="meta-grid">
                <div className="meta-cell"><div className="meta-k">Title</div><div className="meta-v" style={{ fontSize: 12.5, lineHeight: 1.4 }}>{doc.title}</div></div>
                <div className="meta-cell"><div className="meta-k">Slug</div><div className="meta-v mono" style={{ fontSize: 11.5 }}>/{doc.slug}</div></div>
                <div className="meta-cell"><div className="meta-k">Words</div><div className="meta-v">{doc.wordCount.toLocaleString()}</div></div>
              </div>
            </div>
            <div className="drawer-foot">
              <button className="btn btn-primary" disabled={busy} onClick={() => publish(confirming)}>
                {busy ? <><span className="spinner" />Sending…</> : confirming === 'publish' ? 'Yes, publish' : 'Send draft'}
              </button>
              <button className="btn" disabled={busy} onClick={() => setConfirming(null)}>Cancel</button>
            </div>
          </div>
        </>
      )}

      {toasts.length > 0 && (
        <div className="toasts">
          {toasts.map((t) => <div className="toast" key={t.id}><I d={P.check} s={15} /><span>{t.text}</span></div>)}
        </div>
      )}
    </div>
  );
}
