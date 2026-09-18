import { useEffect, useState } from 'react';

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
  tag: 'M20.6 13.4 12 22l-9-9V3h10z M7 7h.01',
  plus: 'M12 5v14M5 12h14',
  spark: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
};

export type Doc = {
  id: string; title: string; slug: string; status: string; body: string; html: string;
  wordCount: number; seoScore: number; targetKeyword: string | null; excerpt: string | null;
  model: string | null; costUsd: number | null;
  categories: string[]; tags: string[]; termsFromModel: boolean;
  wpUrl: string | null; wpPostId: number | null; wpStatus: string | null; publishError: string | null;
  publishedAt: string | null; createdAt: string;
};

type WpTerm = { id: number; name: string; slug: string; count: number };

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
  const [terms, setTerms] = useState<{ categories: WpTerm[]; tags: WpTerm[] } | null>(null);
  const [tagDraft, setTagDraft] = useState('');

  const doc = docs.find((d) => d.id === activeId) ?? null;

  const toast = (text: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  };

  // The site's real taxonomy, fetched once. Categories must already exist on
  // WordPress to be selectable; tags are free-form, so the list is only there
  // to help you reuse a tag rather than coin a near-duplicate.
  useEffect(() => {
    if (!wpReady) return;
    let cancelled = false;
    fetch(`/api/wordpress/terms?siteId=${siteId}`)
      .then((r) => r.json())
      .then((r) => { if (!cancelled && r.ok) setTerms(r.data); })
      .catch(() => { /* the picker degrades to free text */ });
    return () => { cancelled = true; };
  }, [siteId, wpReady]);

  async function saveTerms(next: { categories?: string[]; tags?: string[] }) {
    if (!doc) return;
    const optimistic = {
      categories: next.categories ?? doc.categories,
      tags: next.tags ?? doc.tags,
    };
    // Reflect the change immediately; a taxonomy edit that lags feels broken.
    setDocs((ds) => ds.map((d) => (d.id === doc.id ? { ...d, ...optimistic, termsFromModel: false } : d)));

    const r = await fetch('/api/blog/terms', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contentId: doc.id, ...optimistic }),
    }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));

    if (!r.ok) {
      setError(r.error);
      // Put back what the server still believes, rather than leaving the screen
      // showing an edit that was never stored.
      setDocs((ds) => ds.map((d) => (d.id === doc.id ? { ...d, categories: doc.categories, tags: doc.tags, termsFromModel: doc.termsFromModel } : d)));
    }
  }

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
    // A category that matched nothing is the one outcome worth interrupting
    // for: the post went live, but not where it was meant to go.
    const missing: string[] = r.data.terms?.missing ?? [];
    const created: string[] = r.data.terms?.created ?? [];
    if (missing.length) {
      setError(
        `Published, but these did not exist on WordPress and were not applied: ${missing.join(', ')}. ` +
        'Create them in WordPress, or pick from the list, then update the post.',
      );
    }
    toast(
      (status === 'publish' ? 'Published to WordPress' : 'Saved as a WordPress draft') +
      (created.length ? ` — created ${created.length} new tag${created.length === 1 ? '' : 's'}` : ''),
    );
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

            {wpReady && (
              <section style={{ marginTop: 26, padding: '14px 16px', background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <I d={P.tag} s={13} />
                  <strong style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Category and tags</strong>
                  {doc.termsFromModel && (doc.categories.length > 0 || doc.tags.length > 0) && (
                    <span className="badge violet" title="Proposed by the writer. Edit or accept before publishing.">
                      <I d={P.spark} s={10} />Suggested
                    </span>
                  )}
                  <div className="spacer" />
                  <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>Applied when you publish</span>
                </div>

                {/* Category: chosen from what exists, because WordPress ignores
                    a category that is not already on the site. */}
                <label style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 5 }}>Category</label>
                <select
                  className="input"
                  style={{ maxWidth: 320, marginBottom: 14 }}
                  value={doc.categories[0] ?? ''}
                  onChange={(e) => void saveTerms({ categories: e.target.value ? [e.target.value] : [] })}
                >
                  <option value="">No category (uses the site default)</option>
                  {/* A suggested category that is not in the fetched list would
                      otherwise vanish from the dropdown without explanation. */}
                  {doc.categories[0] && !terms?.categories.some((c) => c.name === doc.categories[0]) && (
                    <option value={doc.categories[0]}>{doc.categories[0]} — not on WordPress</option>
                  )}
                  {terms?.categories.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}{c.count ? ` (${c.count})` : ''}</option>
                  ))}
                </select>

                <label style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 5 }}>Tags</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {doc.tags.map((t) => (
                    <span key={t} className="badge gray" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      {t}
                      <button
                        type="button"
                        aria-label={`Remove ${t}`}
                        style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'inherit' }}
                        onClick={() => void saveTerms({ tags: doc.tags.filter((x) => x !== t) })}
                      >
                        <I d={P.x} s={10} />
                      </button>
                    </span>
                  ))}

                  <input
                    className="input"
                    style={{ width: 190, padding: '4px 9px', fontSize: 12 }}
                    placeholder="Add a tag…"
                    list="wp-tag-suggestions"
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ',') return;
                      e.preventDefault();
                      const next = tagDraft.trim();
                      // Case-insensitive, because WordPress treats "Astro" and
                      // "astro" as one tag and would silently merge them.
                      if (!next || doc.tags.some((t) => t.toLowerCase() === next.toLowerCase())) {
                        setTagDraft('');
                        return;
                      }
                      void saveTerms({ tags: [...doc.tags, next] });
                      setTagDraft('');
                    }}
                  />
                  <datalist id="wp-tag-suggestions">
                    {terms?.tags.map((t) => <option key={t.id} value={t.name} />)}
                  </datalist>
                </div>

                <p style={{ fontSize: 11, color: 'var(--ink-4)', margin: '10px 0 0', lineHeight: 1.5 }}>
                  Tags that do not exist yet are created on your site when you publish. Categories are not —
                  pick one that already exists, or add it in WordPress first.
                </p>
              </section>
            )}

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
