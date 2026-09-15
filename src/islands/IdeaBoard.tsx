import { useMemo, useState } from 'react';

const I = ({ d, s = 14 }: { d: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const P = {
  spark: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
  plus: 'M12 5v14M5 12h14',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  cal: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  rocket: 'M5 3l14 9-14 9z',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
  chev: 'M6 9l6 6 6-6',
};

export type Idea = {
  id: string; title: string; angle: string | null; targetQuery: string | null;
  rationale: string; evidence: { source: string; finding: string }[];
  source: string; score: number;
  impressions: number | null; clicks: number | null; position: number | null;
  status: string; createdBy: string;
  scheduledFor: string | null; autoGenerate: boolean; autoPublish: boolean;
  contentId: string | null; contentWords: number | null; wpUrl: string | null;
  runError: string | null;
};

const SOURCE_LABEL: Record<string, { text: string; tone: string }> = {
  GSC_NEAR_MISS: { text: 'Page 2 — liftable', tone: 'amber' },
  GSC_NO_CLICKS: { text: 'Impressions, no clicks', tone: 'violet' },
  CONTENT_GAP: { text: 'Gap', tone: 'blue' },
  THIN_PAGE: { text: 'Thin page', tone: 'amber' },
  LLM: { text: 'Proposed', tone: 'gray' },
  MANUAL: { text: 'Yours', tone: 'cyan' },
};

const STATUS_TONE: Record<string, string> = {
  SUGGESTED: 'gray', SCHEDULED: 'blue', GENERATING: 'violet',
  DRAFTED: 'amber', PUBLISHED: 'green', DISMISSED: 'gray',
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export default function IdeaBoard({
  ideas: initial, siteId, llmReady, wpReady, hasGsc, ideaModel,
}: {
  ideas: Idea[]; siteId: string; llmReady: boolean; wpReady: boolean; hasGsc: boolean; ideaModel: string;
}) {
  const [ideas, setIdeas] = useState(initial);
  const [filter, setFilter] = useState('open');
  const [busy, setBusy] = useState<string | null>(null);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: string; text: string }[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newQuery, setNewQuery] = useState('');
  const [count, setCount] = useState(10);
  const [lastRun, setLastRun] = useState<any>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [schedDate, setSchedDate] = useState(plusDays(1));
  const [schedAutoPublish, setSchedAutoPublish] = useState(false);

  const toast = (text: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  };

  const patch = (id: string, data: Partial<Idea>) =>
    setIdeas((xs) => xs.map((x) => (x.id === id ? { ...x, ...data } : x)));

  const shown = useMemo(() => {
    const live = ideas.filter((i) => i.status !== 'DISMISSED');
    if (filter === 'open') return live.filter((i) => i.status === 'SUGGESTED');
    if (filter === 'scheduled') return live.filter((i) => i.status === 'SCHEDULED');
    if (filter === 'drafted') return live.filter((i) => i.status === 'DRAFTED');
    if (filter === 'published') return live.filter((i) => i.status === 'PUBLISHED');
    return live;
  }, [ideas, filter]);

  const counts = useMemo(() => {
    const live = ideas.filter((i) => i.status !== 'DISMISSED');
    return {
      all: live.length,
      open: live.filter((i) => i.status === 'SUGGESTED').length,
      scheduled: live.filter((i) => i.status === 'SCHEDULED').length,
      drafted: live.filter((i) => i.status === 'DRAFTED').length,
      published: live.filter((i) => i.status === 'PUBLISHED').length,
    };
  }, [ideas]);

  // ------------------------------------------------------------- actions

  async function generateMore() {
    setBusy('generate'); setError(null); setLastRun(null);
    setPhase('Reading your pages and Search Console data…');
    const r = await fetch('/api/ideas', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, count }),
    }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    setBusy(null); setPhase('');

    if (!r.ok) { setError(r.error); return; }
    setLastRun(r.data);
    if (r.data.saved > 0) { toast(`${r.data.saved} new titles`); setTimeout(() => window.location.reload(), 900); }
    else toast('No new titles — everything it proposed was already on your list');
  }

  async function addManual(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setBusy('add'); setError(null);
    const r = await fetch('/api/ideas', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, title: newTitle.trim(), targetQuery: newQuery.trim() || undefined }),
    }).then((x) => x.json());
    setBusy(null);
    if (!r.ok) { setError(r.error ?? r.issues?.[0]?.message); return; }
    setIdeas((xs) => [{
      ...r.data, evidence: [], scheduledFor: null, autoGenerate: true, autoPublish: false,
      contentId: null, contentWords: null, wpUrl: null, runError: null,
    }, ...xs]);
    setNewTitle(''); setNewQuery(''); setAdding(false);
    toast('Added');
  }

  async function schedule(idea: Idea) {
    setBusy(idea.id); setError(null);
    const r = await fetch('/api/ideas/schedule', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, ideaId: idea.id, date: schedDate, autoGenerate: true, autoPublish: schedAutoPublish }),
    }).then((x) => x.json());
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    patch(idea.id, { status: 'SCHEDULED', scheduledFor: schedDate, autoPublish: schedAutoPublish });
    setScheduling(null);
    toast(`Scheduled for ${new Date(schedDate).toLocaleDateString()}${schedAutoPublish ? ' — will publish itself' : ''}`);
  }

  async function unschedule(idea: Idea) {
    setBusy(idea.id);
    const r = await fetch('/api/ideas/schedule', {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ideaId: idea.id }),
    }).then((x) => x.json());
    setBusy(null);
    if (r.ok) { patch(idea.id, { status: 'SUGGESTED', scheduledFor: null, autoPublish: false }); toast('Removed from the calendar'); }
  }

  async function generateNow(idea: Idea) {
    setBusy(idea.id); setError(null);
    setPhase('Planning the outline…');
    const slow = setTimeout(() => setPhase('Writing the sections…'), 6000);
    const r = await fetch('/api/blog/generate', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, ideaId: idea.id }),
    }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    clearTimeout(slow);
    setBusy(null); setPhase('');

    if (!r.ok) { setError(r.error); return; }
    patch(idea.id, { status: 'DRAFTED', contentId: r.data.id, contentWords: r.data.wordCount });
    toast(`Written — ${r.data.wordCount.toLocaleString()} words, SEO ${r.data.seoScore}`);
  }

  async function publish(idea: Idea) {
    if (!idea.contentId) return;
    setBusy(idea.id); setError(null);
    const r = await fetch('/api/blog/publish', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contentId: idea.contentId, status: 'publish', confirm: true }),
    }).then((x) => x.json());
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    patch(idea.id, { status: 'PUBLISHED', wpUrl: r.data.url });
    toast('Published to WordPress');
  }

  async function dismiss(idea: Idea) {
    setBusy(idea.id);
    await fetch(`/api/ideas/${idea.id}`, { method: 'DELETE' });
    setBusy(null);
    patch(idea.id, { status: 'DISMISSED' });
    toast('Dismissed');
  }

  // ------------------------------------------------------------- render

  const FILTERS = [
    { key: 'open', label: 'To plan', n: counts.open },
    { key: 'scheduled', label: 'Scheduled', n: counts.scheduled },
    { key: 'drafted', label: 'Written', n: counts.drafted },
    { key: 'published', label: 'Published', n: counts.published },
    { key: 'all', label: 'All', n: counts.all },
  ];

  return (
    <>
      {/* generate bar */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="card-title">Generate titles</div>
            <div className="card-sub">
              {hasGsc
                ? 'Grounded in your crawled pages and real Search Console queries'
                : 'Grounded in your crawled pages — connect Search Console for demand data'}
            </div>
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <select className="input" style={{ width: 96, height: 32 }} value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={!!busy}>
              {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button className="btn btn-ai" disabled={!llmReady || !!busy} onClick={generateMore}>
              {busy === 'generate' ? <><span className="spinner" />Thinking…</> : <><I d={P.spark} s={13} />Generate titles</>}
            </button>
            <button className="btn" disabled={!!busy} onClick={() => setAdding((v) => !v)}>
              <I d={P.plus} s={13} />Add your own
            </button>
          </div>
        </div>

        {busy === 'generate' && phase && (
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line-2)', fontSize: 12.5, color: 'var(--ink-3)', display: 'flex', gap: 9, alignItems: 'center' }}>
            <span className="spinner" style={{ color: 'var(--blue)' }} />{phase}
          </div>
        )}

        {!llmReady && (
          <div style={{ padding: '14px 18px', borderTop: '1px solid var(--line-2)' }}>
            <div style={{ display: 'flex', gap: 9, fontSize: 12.5, color: '#92400e', background: 'var(--amber-soft)', border: '1px solid var(--amber-line)', borderRadius: 8, padding: '10px 12px' }}>
              <I d={P.alert} s={14} />
              <span>
                No model key yet. Add <span className="mono">GROQ_API_KEY</span> or{' '}
                <span className="mono">OPENROUTER_API_KEY</span> to <span className="mono">.env</span> and restart —
                see Settings for the details. You can still add titles by hand.
              </span>
            </div>
          </div>
        )}

        {adding && (
          <form onSubmit={addManual} style={{ padding: '14px 18px', borderTop: '1px solid var(--line-2)' }}>
            <div className="field" style={{ marginBottom: 9 }}>
              <label className="field-label">Title</label>
              <input className="input" autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="The post you want written" />
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label className="field-label">Target query <span style={{ fontWeight: 400, color: 'var(--ink-4)' }}>· optional</span></label>
              <input className="input" value={newQuery} onChange={(e) => setNewQuery(e.target.value)} placeholder="what people search for" />
            </div>
            <div className="row">
              <button className="btn btn-primary btn-sm" type="submit" disabled={busy === 'add' || !newTitle.trim()}>Add title</button>
              <button className="btn btn-sm" type="button" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </form>
        )}

        {lastRun && (
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line-2)', fontSize: 12, color: 'var(--ink-3)' }}>
            {lastRun.saved} saved of {lastRun.proposed} proposed
            {lastRun.duplicatesSkipped > 0 && ` · ${lastRun.duplicatesSkipped} were already on your list`}
            {' · '}read {lastRun.groundedIn.pages} pages
            {lastRun.groundedIn.nearMissQueries > 0 && `, ${lastRun.groundedIn.nearMissQueries} page-2 queries`}
            {lastRun.costUsd != null && ` · $${lastRun.costUsd.toFixed(4)}`}
            {' · '}<span className="mono">{lastRun.model}</span>
          </div>
        )}

        {error && (
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line-2)' }}>
            <div style={{ display: 'flex', gap: 9, fontSize: 12.5, color: '#991b1b', background: 'var(--red-soft)', border: '1px solid var(--red-line)', borderRadius: 8, padding: '10px 12px' }}>
              <I d={P.alert} s={14} /><span>{error}</span>
            </div>
          </div>
        )}
      </div>

      <div className="filters" style={{ marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button key={f.key} className={`filter ${filter === f.key ? 'on' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}<span className="filter-n">{f.n}</span>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="opp-list">
          {shown.length === 0 && (
            <div className="empty">
              <div className="empty-icon">✎</div>
              {counts.all === 0 ? 'No titles yet — generate some, or add your own.' : 'Nothing in this view.'}
            </div>
          )}

          {shown.map((idea) => {
            const src = SOURCE_LABEL[idea.source] ?? SOURCE_LABEL.LLM;
            const open = expanded === idea.id;
            const working = busy === idea.id;

            return (
              <div key={idea.id} style={{ borderBottom: '1px solid var(--line-2)' }}>
                <div className="opp" style={{ borderBottom: 'none' }} onClick={() => setExpanded(open ? null : idea.id)}>
                  <span className="opp-rank" style={{ background: idea.score >= 75 ? 'var(--blue-soft)' : undefined, color: idea.score >= 75 ? 'var(--blue)' : undefined }}>
                    {idea.score}
                  </span>
                  <div className="opp-body">
                    <div className="opp-title">{idea.title}</div>
                    <div className="opp-meta">
                      <span className={`badge ${src.tone}`}>{src.text}</span>
                      <span className={`badge ${STATUS_TONE[idea.status]}`}>
                        {idea.status === 'DRAFTED' ? 'Written' : idea.status[0] + idea.status.slice(1).toLowerCase()}
                      </span>
                      {idea.targetQuery && <span className="opp-stat">“{idea.targetQuery}”</span>}
                      {idea.impressions != null && <span className="opp-stat"><b>{idea.impressions.toLocaleString()}</b> impr</span>}
                      {idea.position != null && <span className="opp-stat">pos <b>{idea.position.toFixed(1)}</b></span>}
                      {idea.scheduledFor && (
                        <span className="badge blue"><I d={P.cal} s={10} />{new Date(idea.scheduledFor).toLocaleDateString()}</span>
                      )}
                      {idea.autoPublish && <span className="badge green">auto-publish</span>}
                      {idea.contentWords != null && <span className="opp-stat"><b>{idea.contentWords.toLocaleString()}</b> words</span>}
                    </div>
                    {idea.runError && (
                      <div style={{ marginTop: 7, fontSize: 11.5, color: 'var(--red)' }}>{idea.runError}</div>
                    )}
                  </div>
                  <div className="opp-act" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {working && <span className="spinner" style={{ color: 'var(--blue)' }} />}
                    <span style={{ color: 'var(--ink-4)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}>
                      <I d={P.chev} s={14} />
                    </span>
                  </div>
                </div>

                {open && (
                  <div style={{ padding: '0 18px 16px 55px' }} className="anim-in">
                    {idea.angle && (
                      <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 10 }}>
                        <strong style={{ fontWeight: 600 }}>Angle. </strong>{idea.angle}
                      </div>
                    )}
                    <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 12 }}>
                      <strong style={{ fontWeight: 600 }}>Why. </strong>{idea.rationale}
                    </div>

                    {idea.evidence.length > 0 && (
                      <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-4)', background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 7, padding: '8px 10px', marginBottom: 14 }}>
                        {idea.evidence.map((e, i) => <div key={i}>{e.finding}</div>)}
                      </div>
                    )}

                    {scheduling === idea.id ? (
                      <div style={{ border: '1px solid var(--line)', borderRadius: 9, padding: 14, marginBottom: 12, background: 'var(--surface-2)' }}>
                        <div className="field" style={{ marginBottom: 10 }}>
                          <label className="field-label">Write it on</label>
                          <input className="input" type="date" min={todayISO()} value={schedDate} onChange={(e) => setSchedDate(e.target.value)} />
                        </div>
                        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 12, cursor: wpReady ? 'pointer' : 'not-allowed', opacity: wpReady ? 1 : 0.5 }}>
                          <input type="checkbox" checked={schedAutoPublish} disabled={!wpReady} onChange={(e) => setSchedAutoPublish(e.target.checked)} style={{ marginTop: 2 }} />
                          <span>
                            Publish it to WordPress automatically on that day
                            {!wpReady && <span style={{ color: 'var(--ink-4)' }}> — connect WordPress first</span>}
                          </span>
                        </label>
                        <div className="row">
                          <button className="btn btn-primary btn-sm" disabled={working} onClick={() => schedule(idea)}>Schedule</button>
                          <button className="btn btn-sm" onClick={() => setScheduling(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                        {idea.status !== 'PUBLISHED' && !idea.contentId && (
                          <button className="btn btn-sm btn-ai" disabled={!llmReady || working} onClick={() => generateNow(idea)}>
                            <I d={P.spark} s={12} />{working && phase ? phase : 'Generate blog now'}
                          </button>
                        )}
                        {idea.contentId && (
                          <a className="btn btn-sm" href={`/studio?site=${siteId}&doc=${idea.contentId}`}>
                            <I d={P.doc} s={12} />Open draft
                          </a>
                        )}
                        {idea.contentId && idea.status !== 'PUBLISHED' && (
                          <button className="btn btn-sm btn-primary" disabled={!wpReady || working} onClick={() => publish(idea)}>
                            <I d={P.rocket} s={12} />Publish now
                          </button>
                        )}
                        {idea.wpUrl && (
                          <a className="btn btn-sm" href={idea.wpUrl} target="_blank" rel="noreferrer">View live post</a>
                        )}
                        {idea.status === 'SCHEDULED' ? (
                          <button className="btn btn-sm" disabled={working} onClick={() => unschedule(idea)}>Unschedule</button>
                        ) : idea.status !== 'PUBLISHED' && (
                          <button className="btn btn-sm" onClick={() => { setScheduling(idea.id); setSchedDate(plusDays(1)); setSchedAutoPublish(false); }}>
                            <I d={P.cal} s={12} />Schedule
                          </button>
                        )}
                        {idea.status === 'SUGGESTED' && (
                          <button className="btn btn-sm btn-ghost" disabled={working} onClick={() => dismiss(idea)}>Dismiss</button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
