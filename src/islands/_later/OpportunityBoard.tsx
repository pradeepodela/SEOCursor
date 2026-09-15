import { useMemo, useState } from 'react';

export type Opp = {
  id: string; rank: number; title: string; subject: string; type: string;
  impact: string; effort: string; searchVolume: number | null; impressions: number | null;
  difficulty: number | null; competition: string | null; currentCoverage: string | null;
  quickWin: boolean; recommendedAction: string; actionLabel: string;
  reasoning: { source: string; finding: string }[]; conclusion: string | null; status: string;
};

const TYPE_LABEL: Record<string, string> = {
  NEW_CONTENT: 'New Content', UPDATE_PAGE: 'Update Page', INTERNAL_LINKING: 'Internal Linking',
  TECHNICAL: 'Technical', KEYWORD: 'Keyword', COMPETITOR: 'Competitor',
};
const IMPACT_TONE: Record<string, string> = { HIGH: 'red', MEDIUM: 'amber', LOW: 'gray' };
const SOURCE_ICON: Record<string, string> = {
  'Keyword data': 'M15 2a7 7 0 0 0-6.6 9.3L2 17.7V22h4.3l1.4-1.4V19h1.6l1.4-1.4v-1.6h1.6l1-1A7 7 0 1 0 15 2',
  'Search Console': 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3',
  Crawler: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10',
  Competitors: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
};

const I = ({ d, s = 14 }: { d: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const P = {
  x: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  spark: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2',
};

const fmt = (n: number | null) => (n === null ? '—' : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(n));

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'NEW_CONTENT', label: 'Content' },
  { key: 'UPDATE_PAGE', label: 'Pages' },
  { key: 'TECHNICAL', label: 'Technical' },
  { key: 'INTERNAL_LINKING', label: 'Internal Links' },
  { key: 'quick', label: 'Quick Wins' },
  { key: 'high', label: 'High Impact' },
];

export default function OpportunityBoard({
  opps, siteId, showFilters = false, limit,
}: { opps: Opp[]; siteId: string; showFilters?: boolean; limit?: number }) {
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState<Opp | null>(null);
  const [phase, setPhase] = useState<'idle' | 'brief' | 'writing' | 'article'>('idle');
  const [stage, setStage] = useState('');
  const [brief, setBrief] = useState<any>(null);
  const [article, setArticle] = useState<any>(null);
  const [toasts, setToasts] = useState<{ id: string; text: string }[]>([]);
  const [done, setDone] = useState<Record<string, string>>({});

  const toast = (text: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  };

  const shown = useMemo(() => {
    let list = opps;
    if (filter === 'quick') list = list.filter((o) => o.quickWin);
    else if (filter === 'high') list = list.filter((o) => o.impact === 'HIGH');
    else if (filter !== 'all') list = list.filter((o) => o.type === filter);
    return limit ? list.slice(0, limit) : list;
  }, [opps, filter, limit]);

  const counts = useMemo(() => ({
    all: opps.length,
    quick: opps.filter((o) => o.quickWin).length,
    high: opps.filter((o) => o.impact === 'HIGH').length,
    ...Object.fromEntries(FILTERS.filter((f) => !['all', 'quick', 'high'].includes(f.key))
      .map((f) => [f.key, opps.filter((o) => o.type === f.key).length])),
  }), [opps]);

  function openOpp(o: Opp) {
    setOpen(o); setPhase('idle'); setBrief(null); setArticle(null);
  }

  async function generateBrief(o: Opp) {
    setPhase('brief'); setStage('Analysing the SERP…');
    await wait(500); setStage('Reading the top 3 ranking pages…');
    await wait(600); setStage('Structuring the outline…');
    const res = await fetch('/api/brief', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, opportunityId: o.id }),
    });
    const json = await res.json();
    await wait(300);
    if (json.ok) { setBrief(json.data); setStage(''); }
    else { setStage(''); setPhase('idle'); toast(json.error ?? 'Could not build the brief'); }
  }

  async function generateArticle() {
    if (!brief?.id) return;
    setPhase('writing');
    for (const s of ['Loading the brief…', 'Drafting the introduction…', 'Writing section 2 of 7…', 'Writing section 5 of 7…', 'Adding internal links…', 'Optimising for the target keyword…']) {
      setStage(s); await wait(520);
    }
    const res = await fetch('/api/article', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, briefId: brief.id }),
    });
    const json = await res.json();
    setStage('');
    if (json.ok) { setArticle(json.data); setPhase('article'); }
    else { setPhase('brief'); toast(json.error ?? 'Generation failed'); }
  }

  async function schedule(o: Opp) {
    const res = await fetch('/api/calendar', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        siteId, title: o.title, type: o.type === 'UPDATE_PAGE' ? 'UPDATE' : o.type === 'TECHNICAL' ? 'TECHNICAL' : o.type === 'INTERNAL_LINKING' ? 'INTERNAL_LINKING' : 'BLOG',
        date: new Date(Date.UTC(2026, 8, 24)).toISOString(), opportunityId: o.id,
      }),
    });
    const json = await res.json();
    if (json.ok) { setDone((d) => ({ ...d, [o.id]: 'scheduled' })); toast(`Added to the calendar for Sep 24`); }
    else toast(json.error ?? 'Could not schedule');
  }

  return (
    <>
      {showFilters && (
        <div className="filters" style={{ marginBottom: 16 }}>
          {FILTERS.map((f) => (
            <button key={f.key} className={`filter ${filter === f.key ? 'on' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label}<span className="filter-n">{(counts as any)[f.key] ?? 0}</span>
            </button>
          ))}
        </div>
      )}

      <div className="opp-list">
        {shown.length === 0 && (
          <div className="empty"><div className="empty-icon">✓</div>Nothing in this filter. Try another.</div>
        )}
        {shown.map((o, i) => (
          <div className="opp" key={o.id} onClick={() => openOpp(o)}>
            <span className="opp-rank">{i + 1}</span>
            <div className="opp-body">
              <div className="opp-title">{o.title}</div>
              <div className="opp-meta">
                <span className={`badge ${IMPACT_TONE[o.impact]}`}>{o.impact[0] + o.impact.slice(1).toLowerCase()} Impact</span>
                {o.quickWin && <span className="badge green">Quick Win</span>}
                <span className="badge gray">{TYPE_LABEL[o.type] ?? o.type}</span>
                {o.searchVolume !== null && <span className="opp-stat">Search volume: <b>{fmt(o.searchVolume)}</b></span>}
                {o.searchVolume === null && o.impressions !== null && <span className="opp-stat">Impressions: <b>{fmt(o.impressions)}</b></span>}
                {done[o.id] && <span className="badge blue">Scheduled</span>}
              </div>
            </div>
            <div className="opp-act">
              <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); openOpp(o); }}>{o.actionLabel}</button>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <>
          <div className="scrim" onClick={() => setOpen(null)} />
          <aside className={`drawer ${phase === 'article' ? 'wide' : ''}`}>
            <div className="drawer-head">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-4)' }}>
                  Opportunity · {TYPE_LABEL[open.type]}
                </div>
                <h2 className="h2" style={{ marginTop: 5, lineHeight: 1.3 }}>{open.title}</h2>
              </div>
              <button className="x-btn" onClick={() => setOpen(null)}><I d={P.x} /></button>
            </div>

            <div className="drawer-body">
              {phase === 'idle' && <IdleView o={open} />}

              {phase === 'brief' && !brief && <Working stage={stage} label="Building the brief" />}
              {phase === 'brief' && brief && <BriefView brief={brief} />}

              {phase === 'writing' && <Working stage={stage} label="Writing the article" long />}

              {phase === 'article' && article && (
                <div className="doc">
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                    <span className="badge green"><I d={P.check} s={11} />Generated</span>
                    <span className="badge gray">{article.wordCount.toLocaleString()} words</span>
                    <span className="badge blue">SEO {article.seoScore}/100</span>
                  </div>
                  <h1>{article.title}</h1>
                  <div className="mono" style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 20 }}>{article.url}</div>
                  <div dangerouslySetInnerHTML={{ __html: article.html }} />
                </div>
              )}
            </div>

            <div className="drawer-foot">
              {phase === 'idle' && (
                <>
                  {open.type === 'TECHNICAL' ? (
                    <a className="btn btn-primary" href={`/audit?site=${siteId}`}>View issues</a>
                  ) : open.type === 'UPDATE_PAGE' ? (
                    <a className="btn btn-primary" href={`/pages?site=${siteId}&q=${encodeURIComponent(open.subject)}`}>Open the page</a>
                  ) : open.type === 'INTERNAL_LINKING' ? (
                    <button className="btn btn-primary" onClick={() => toast('Queued 34 internal links across 12 pages')}>Apply link plan</button>
                  ) : (
                    <button className="btn btn-ai" onClick={() => generateBrief(open)}><I d={P.spark} s={13} />Generate Brief</button>
                  )}
                  <button className="btn" onClick={() => schedule(open)} disabled={!!done[open.id]}>
                    <I d={P.calendar} s={13} />{done[open.id] ? 'Scheduled' : 'Add to calendar'}
                  </button>
                  <div className="spacer" />
                  <button className="btn btn-ghost" data-ask={`Why is "${open.title}" the right thing to do?`} onClick={() => setOpen(null)}>Ask AI</button>
                </>
              )}
              {phase === 'brief' && brief && (
                <>
                  <button className="btn btn-ai" onClick={generateArticle}><I d={P.spark} s={13} />Generate Article</button>
                  <a className="btn" href={`/studio?site=${siteId}&brief=${brief.id}`}>Open in Studio</a>
                </>
              )}
              {phase === 'article' && article && (
                <>
                  <a className="btn btn-primary" href={`/studio?site=${siteId}&doc=${article.id}`}>Open in Content Studio</a>
                  <button className="btn" onClick={() => toast('Draft saved')}>Save draft</button>
                </>
              )}
              {(phase === 'writing' || (phase === 'brief' && !brief)) && (
                <span className="muted" style={{ fontSize: 12.5 }}>Working…</span>
              )}
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

function IdleView({ o }: { o: Opp }) {
  return (
    <>
      <div className="meta-grid" style={{ marginBottom: 20 }}>
        <div className="meta-cell"><div className="meta-k">Impact</div><div className="meta-v">{o.impact[0] + o.impact.slice(1).toLowerCase()}</div></div>
        <div className="meta-cell"><div className="meta-k">Effort</div><div className="meta-v">{o.effort[0] + o.effort.slice(1).toLowerCase()}</div></div>
        {o.searchVolume !== null && <div className="meta-cell"><div className="meta-k">Search demand</div><div className="meta-v">{fmt(o.searchVolume)}/mo</div></div>}
        {o.difficulty !== null && <div className="meta-cell"><div className="meta-k">Difficulty</div><div className="meta-v">{o.difficulty}</div></div>}
        {o.impressions !== null && <div className="meta-cell"><div className="meta-k">Impressions</div><div className="meta-v">{fmt(o.impressions)}</div></div>}
        {o.competition && <div className="meta-cell"><div className="meta-k">Competition</div><div className="meta-v">{o.competition}</div></div>}
        {o.currentCoverage && <div className="meta-cell"><div className="meta-k">Your coverage</div><div className="meta-v">{o.currentCoverage}</div></div>}
      </div>

      <h3 style={{ fontSize: 13, fontWeight: 620, margin: '0 0 12px' }}>How I reached this</h3>
      <div className="reason">
        {o.reasoning.map((r, i) => (
          <div className="reason-step" key={i}>
            <span className="reason-icon"><I d={SOURCE_ICON[r.source] ?? SOURCE_ICON.Crawler} s={12} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="reason-src">{r.source}</div>
              <div className="reason-txt">{r.finding}</div>
            </div>
          </div>
        ))}
      </div>

      {o.conclusion && (
        <div className="verdict">
          <div className="verdict-tag">Conclusion</div>
          <div className="verdict-txt">{o.conclusion}</div>
        </div>
      )}

      <div className="sep" />
      <h3 style={{ fontSize: 13, fontWeight: 620, margin: '0 0 7px' }}>Recommended action</h3>
      <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6, margin: 0 }}>{o.recommendedAction}</p>
    </>
  );
}

function BriefView({ brief }: { brief: any }) {
  return (
    <>
      <div className="brief-box">
        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--blue)', marginBottom: 9 }}>SEO Brief</div>
        <div style={{ fontSize: 16, fontWeight: 620, letterSpacing: '-.015em', lineHeight: 1.35 }}>{brief.suggestedTitle}</div>
        <div className="meta-grid" style={{ marginTop: 14 }}>
          <div className="meta-cell"><div className="meta-k">Target keyword</div><div className="meta-v" style={{ fontSize: 12.5 }}>{brief.targetKeyword}</div></div>
          <div className="meta-cell"><div className="meta-k">Intent</div><div className="meta-v" style={{ fontSize: 12.5 }}>{brief.intent[0] + brief.intent.slice(1).toLowerCase()}</div></div>
          <div className="meta-cell"><div className="meta-k">URL</div><div className="meta-v mono" style={{ fontSize: 12 }}>{brief.recommendedUrl}</div></div>
          <div className="meta-cell"><div className="meta-k">Volume</div><div className="meta-v" style={{ fontSize: 12.5 }}>{fmt(brief.searchVolume)}/mo</div></div>
          <div className="meta-cell"><div className="meta-k">Difficulty</div><div className="meta-v" style={{ fontSize: 12.5 }}>{brief.difficulty}</div></div>
          <div className="meta-cell"><div className="meta-k">Target length</div><div className="meta-v" style={{ fontSize: 12.5 }}>{brief.targetWords.toLocaleString()} words</div></div>
        </div>
      </div>

      <h3 style={{ fontSize: 13, fontWeight: 620, margin: '0 0 8px' }}>Content structure</h3>
      <div style={{ marginBottom: 20 }}>
        {brief.outline.map((s: any, i: number) => (
          <div className="outline-row" key={i}>
            <span className="outline-tag">{s.tag}</span>
            <div>
              <div className="outline-text">{s.text}</div>
              {s.notes && <div className="outline-note">{s.notes}</div>}
            </div>
          </div>
        ))}
      </div>

      <Section title="Entities to cover"><div className="tags">{brief.entities.map((e: string) => <span className="tag" key={e}>{e}</span>)}</div></Section>
      <Section title="Internal links"><div className="tags">{brief.internalLinks.map((e: string) => <span className="tag mono" key={e}>{e}</span>)}</div></Section>
      <Section title="Questions to answer">
        {brief.questions.map((q: string) => (
          <div key={q} style={{ fontSize: 13, color: 'var(--ink-2)', padding: '3px 0' }}>· {q}</div>
        ))}
      </Section>
      <Section title="Competitors ranking now">
        {brief.competitors.map((c: string) => (
          <div key={c} className="mono" style={{ fontSize: 12, color: 'var(--ink-3)', padding: '3px 0' }}>{c}</div>
        ))}
      </Section>
    </>
  );
}

const Section = ({ title, children }: { title: string; children: any }) => (
  <div style={{ marginBottom: 18 }}>
    <h3 style={{ fontSize: 13, fontWeight: 620, margin: '0 0 8px' }}>{title}</h3>
    {children}
  </div>
);

function Working({ stage, label, long = false }: { stage: string; label: string; long?: boolean }) {
  return (
    <div style={{ padding: '28px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span className="spinner" style={{ color: 'var(--blue)' }} />
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>{stage}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {Array.from({ length: long ? 9 : 6 }).map((_, i) => (
          <div key={i} className="shimmer" style={{ height: i % 4 === 0 ? 15 : 10, width: `${[100, 92, 78, 96, 64, 88, 95, 72, 84][i]}%` }} />
        ))}
      </div>
    </div>
  );
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
