import { useEffect, useRef, useState } from 'react';

type Attachment = { kind: string; data: any } | null;
type Msg = { id: string; role: 'user' | 'ai'; content: string; payload?: Attachment };

const CAPABILITIES = [
  'Auditing your website',
  'Finding content opportunities',
  'Generating content briefs',
  'Writing SEO optimized content',
  'Analyzing competitors',
  'Improving existing pages',
  'Tracking performance',
];

const OPENERS = [
  'What should we work on this week?',
  'Audit my homepage',
  'Generate a blog on CRM for startups',
  'Show content calendar',
  'Compare with competitors',
];

const uid = () => Math.random().toString(36).slice(2);

/* ------------------------------------------------------------------ icons */
const I = ({ d, s = 14 }: { d: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const P = {
  check: 'M20 6 9 17l-5-5',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  spark: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
  arrow: 'M9 18l6-6-6-6',
  x: 'M18 6 6 18M6 6l12 12',
};

/* ----------------------------------------------------- tiny inline markdown */
function renderText(text: string) {
  return text.split('\n').map((line, i) => {
    const numbered = line.match(/^(\d+)\.\s+(.*)$/);
    if (numbered) {
      return (
        <div className="li" key={i}>
          <span className="li-n">{numbered[1]}</span>
          <span className="li-t">{inline(numbered[2])}</span>
        </div>
      );
    }
    if (line.startsWith('• ')) {
      return (
        <div className="li" key={i}>
          <span className="li-n">•</span>
          <span className="li-t">{inline(line.slice(2))}</span>
        </div>
      );
    }
    if (!line.trim()) return <div key={i} style={{ height: 7 }} />;
    return <div key={i}>{inline(line)}</div>;
  });
}

function inline(s: string) {
  const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>;
    return <span key={i}>{p}</span>;
  });
}

/* ------------------------------------------------------------- attachments */
function AttachCard({ a, siteId, onAction, onToast }: { a: Attachment; siteId: string; onAction: (t: string) => void; onToast: (m: string) => void }) {
  if (!a) return null;
  const d = a.data;

  if (a.kind === 'plan') {
    return (
      <div className="ai-attach">
        <div className="ai-attach-head"><I d={P.spark} s={13} /><span className="ai-attach-kind">Prioritised plan</span></div>
        <div className="ai-attach-body" style={{ padding: 0 }}>
          {d.items.map((it: any, i: number) => (
            <div key={it.id} style={{ padding: '9px 12px', borderBottom: i < d.items.length - 1 ? '1px solid var(--line-2)' : 'none' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className="opp-rank" style={{ width: 18, height: 18, flex: '0 0 18px', fontSize: 10 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 550, fontSize: 12.5, lineHeight: 1.4 }}>{it.title}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 3 }}>{it.type}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="ai-attach-foot">
          <button className="btn btn-sm btn-primary" onClick={() => onAction('Create briefs for all four')}>Create all briefs</button>
          <a className="btn btn-sm" href={`/opportunities?site=${siteId}`}>Open backlog</a>
        </div>
      </div>
    );
  }

  if (a.kind === 'brief') {
    return (
      <div className="ai-attach">
        <div className="ai-attach-head"><I d={P.spark} s={13} /><span className="ai-attach-kind">Content brief</span></div>
        <div className="ai-attach-body">
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, lineHeight: 1.4 }}>{d.title}</div>
          <div className="ai-attach-row"><span className="ai-attach-k">Target keyword</span><span className="ai-attach-v">{d.targetKeyword}</span></div>
          <div className="ai-attach-row"><span className="ai-attach-k">Search intent</span><span className="ai-attach-v">{d.intent[0] + d.intent.slice(1).toLowerCase()}</span></div>
          <div className="ai-attach-row"><span className="ai-attach-k">Recommended URL</span><span className="ai-attach-v mono">{d.url}</span></div>
          <div className="ai-attach-row"><span className="ai-attach-k">Search volume</span><span className="ai-attach-v">{d.volume.toLocaleString()}/mo</span></div>
          <div className="ai-attach-row"><span className="ai-attach-k">Difficulty</span><span className="ai-attach-v">{d.difficulty}</span></div>
          <div className="ai-attach-row"><span className="ai-attach-k">Target length</span><span className="ai-attach-v">{d.words.toLocaleString()} words · {d.sections} sections</span></div>
          <div className="ai-attach-row"><span className="ai-attach-k">Competitors</span><span className="ai-attach-v" style={{ fontSize: 11.5 }}>{d.competitors.join(', ')}</span></div>
        </div>
        <div className="ai-attach-foot">
          <button className="btn btn-sm btn-ai" onClick={() => onAction('Generate the article')}>Generate Article</button>
          {d.id && <a className="btn btn-sm" href={`/studio?site=${siteId}&brief=${d.id}`}>Open brief</a>}
        </div>
      </div>
    );
  }

  if (a.kind === 'audit') {
    return (
      <div className="ai-attach">
        <div className="ai-attach-head"><I d={P.spark} s={13} /><span className="ai-attach-kind">Audit summary</span></div>
        <div className="ai-attach-body">
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            {[
              { n: d.critical, k: 'Critical', c: 'var(--red)' },
              { n: d.warnings, k: 'Warnings', c: 'var(--amber)' },
              { n: d.passed, k: 'Passed', c: 'var(--green)' },
            ].map((x) => (
              <div key={x.k} style={{ flex: 1, textAlign: 'center', padding: '8px 4px', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--line-2)' }}>
                <div style={{ fontSize: 18, fontWeight: 660, color: x.c, letterSpacing: '-.02em' }}>{x.n}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 1 }}>{x.k}</div>
              </div>
            ))}
          </div>
          {d.top.map((t: any) => (
            <div key={t.id} style={{ display: 'flex', gap: 7, alignItems: 'center', padding: '5px 0', fontSize: 12.5 }}>
              <span className={`dot sev-${t.severity}`} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
            </div>
          ))}
        </div>
        <div className="ai-attach-foot">
          <a className="btn btn-sm btn-primary" href={`/audit?site=${siteId}`}>Open full audit</a>
        </div>
      </div>
    );
  }

  if (a.kind === 'competitors') {
    return (
      <div className="ai-attach">
        <div className="ai-attach-head"><I d={P.spark} s={13} /><span className="ai-attach-kind">Competitor comparison</span></div>
        <div className="ai-attach-body" style={{ padding: 0 }}>
          <table className="comp-tbl" style={{ fontSize: 12 }}>
            <thead><tr><th>Site</th><th>Traffic</th><th>Keywords</th><th>DR</th></tr></thead>
            <tbody>
              {d.rows.map((r: any) => (
                <tr key={r.name}>
                  <td className={r.you ? 'you' : ''}>{r.you ? 'You' : r.label}</td>
                  <td className={r.you ? 'you' : ''}>{fmt(r.traffic)}</td>
                  <td className={r.you ? 'you' : ''}>{fmt(r.keywords)}</td>
                  <td className={r.you ? 'you' : ''}>{r.dr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ai-attach-foot">
          <a className="btn btn-sm btn-primary" href={`/competitors?site=${siteId}`}>Full comparison</a>
        </div>
      </div>
    );
  }

  if (a.kind === 'calendar') {
    return (
      <div className="ai-attach">
        <div className="ai-attach-head"><I d={P.spark} s={13} /><span className="ai-attach-kind">{d.month}</span></div>
        <div className="ai-attach-body" style={{ padding: 0 }}>
          {d.items.map((it: any, i: number) => (
            <div key={it.id} style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '8px 12px', borderBottom: i < d.items.length - 1 ? '1px solid var(--line-2)' : 'none' }}>
              <span style={{ fontSize: 11, color: 'var(--ink-3)', flex: '0 0 42px', fontWeight: 600 }}>{it.date}</span>
              <span className="badge gray" style={{ fontSize: 10 }}>{it.type}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
            </div>
          ))}
        </div>
        <div className="ai-attach-foot">
          <a className="btn btn-sm btn-primary" href={`/calendar?site=${siteId}`}>Open calendar</a>
        </div>
      </div>
    );
  }

  if (a.kind === 'page') {
    return (
      <div className="ai-attach">
        <div className="ai-attach-head"><I d={P.spark} s={13} /><span className="ai-attach-kind">Page recommendations</span></div>
        <div className="ai-attach-body">
          <div className="mono" style={{ fontSize: 12, color: 'var(--blue)', marginBottom: 8 }}>{d.url}</div>
          {d.recommendations.slice(0, 5).map((r: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: i < Math.min(5, d.recommendations.length) - 1 ? '1px solid var(--line-2)' : 'none' }}>
              <span className="li-n" style={{ flex: '0 0 17px', height: 17 }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 530 }}>{r.title}</div>
              </div>
              <span className={`badge ${r.impact === 'HIGH' ? 'red' : 'gray'}`} style={{ fontSize: 10, height: 17 }}>{r.impact[0] + r.impact.slice(1).toLowerCase()}</span>
            </div>
          ))}
        </div>
        <div className="ai-attach-foot">
          <a className="btn btn-sm btn-ai" href={`/pages/${encodeURIComponent(d.id)}?site=${siteId}`}>Open page</a>
          <button className="btn btn-sm" onClick={() => { onToast('Applied 5 changes to ' + d.url); }}>Apply all</button>
        </div>
      </div>
    );
  }

  if (a.kind === 'article') {
    return (
      <div className="ai-attach">
        <div className="ai-attach-head"><I d={P.spark} s={13} /><span className="ai-attach-kind">Article draft</span></div>
        <div className="ai-attach-body">
          <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.4, marginBottom: 8 }}>{d.title}</div>
          <div className="ai-attach-row"><span className="ai-attach-k">Word count</span><span className="ai-attach-v">{d.words.toLocaleString()}</span></div>
          <div className="ai-attach-row"><span className="ai-attach-k">SEO score</span><span className="ai-attach-v" style={{ color: 'var(--green)' }}>{d.seoScore}/100</span></div>
          <div className="ai-attach-row"><span className="ai-attach-k">Slug</span><span className="ai-attach-v mono">/{d.slug}</span></div>
        </div>
        <div className="ai-attach-foot">
          <a className="btn btn-sm btn-primary" href={`/studio?site=${siteId}&doc=${d.id}`}>Open in Studio</a>
        </div>
      </div>
    );
  }

  return null;
}

const fmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(n));

/* ------------------------------------------------------------------ panel */
export default function Assistant({ siteId, domain, seed }: { siteId: string; domain: string; seed?: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>(OPENERS);
  const [toasts, setToasts] = useState<{ id: string; text: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const toast = (text: string) => {
    const id = uid();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, busy, stage]);

  // A question handed over from elsewhere in the app (the "Ask AI" bar, a card button).
  useEffect(() => {
    const handler = (e: Event) => {
      const q = (e as CustomEvent).detail as string;
      if (q) send(q);
    };
    window.addEventListener('sc:ask', handler);
    return () => window.removeEventListener('sc:ask', handler);
  });

  useEffect(() => {
    if (seed) send(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;

    setMsgs((m) => [...m, { id: uid(), role: 'user', content: t }]);
    setInput('');
    setBusy(true);

    // Show the work, not just a spinner — this is what makes it read as reasoning.
    const stages = pickStages(t);
    for (const s of stages) {
      setStage(s);
      await wait(340 + Math.random() * 220);
    }

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId, message: t }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'Request failed');

      setStage('');
      setMsgs((m) => [...m, { id: uid(), role: 'ai', content: json.data.content, payload: json.data.payload }]);
      setSuggestions(json.data.suggestions ?? OPENERS);
    } catch (err) {
      setStage('');
      setMsgs((m) => [...m, { id: uid(), role: 'ai', content: `Something went wrong reaching the analysis layer: ${(err as Error).message}` }]);
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }

  const empty = msgs.length === 0;

  return (
    <>
      <div className="ai-head">
        <div className="ai-mark"><I d={P.spark} s={14} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ai-title">AI SEO Assistant</div>
          <div className="ai-status"><span className="dot" />Online · {domain}</div>
        </div>
        {msgs.length > 0 && (
          <button className="x-btn" title="Clear conversation" onClick={() => { setMsgs([]); setSuggestions(OPENERS); }}>
            <I d={P.x} s={14} />
          </button>
        )}
      </div>

      <div className="ai-scroll" ref={scrollRef}>
        {empty && (
          <>
            <div className="ai-intro-card anim-up">
              <div className="ai-intro-title">I can help you with:</div>
              {CAPABILITIES.map((c) => (
                <div className="ai-cap" key={c}><I d={P.check} s={13} /><span>{c}</span></div>
              ))}
            </div>
            <div style={{ fontSize: 13, fontWeight: 550, padding: '2px 2px 0' }}>What would you like to work on today?</div>
          </>
        )}

        {msgs.map((m) => (
          <div className={`msg ${m.role}`} key={m.id}>
            <div className="bubble">{m.role === 'ai' ? renderText(m.content) : m.content}</div>
            {m.payload && <AttachCard a={m.payload} siteId={siteId} onAction={send} onToast={toast} />}
          </div>
        ))}

        {busy && stage && (
          <div className="ai-thinking anim-in">
            <span className="ai-thinking-dots"><i /><i /><i /></span>
            <span>{stage}</span>
          </div>
        )}

        {!busy && (
          <div className="ai-chips">
            {suggestions.map((s) => (
              <button className="ai-chip" key={s} onClick={() => send(s)}>
                <I d={P.arrow} s={12} />
                <span>{s}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ai-input-wrap">
        <div className="ai-input-box">
          <textarea
            ref={inputRef}
            className="ai-input"
            rows={1}
            placeholder="Ask me anything about your SEO..."
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(110, e.target.scrollHeight) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
            }}
          />
          <button className="ai-send" disabled={!input.trim() || busy} onClick={() => send(input)} title="Send">
            <I d={P.send} s={13} />
          </button>
        </div>
        <div className="ai-hint">It reads your crawl, rankings and competitors before answering.</div>
      </div>

      {toasts.length > 0 && (
        <div className="toasts">
          {toasts.map((t) => (
            <div className="toast" key={t.id}><I d={P.check} s={15} /><span>{t.text}</span></div>
          ))}
        </div>
      )}
    </>
  );
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pickStages(q: string): string[] {
  const s = q.toLowerCase();
  if (/audit|issue|technical|broken/.test(s)) return ['Reading the latest crawl…', 'Grouping 128 pages by issue type…', 'Weighting by page value…'];
  if (/competitor|compare/.test(s)) return ['Pulling competitor profiles…', 'Diffing topic coverage…', 'Finding the gaps that matter…'];
  if (/calendar|schedul|upcoming/.test(s)) return ['Loading the content calendar…', 'Checking what shipped…'];
  if (/brief|outline/.test(s)) return ['Analysing the SERP…', 'Reading the top 3 results…', 'Structuring the outline…'];
  if (/generate|write|draft/.test(s)) return ['Loading the brief…', 'Drafting sections…', 'Optimising for the target keyword…', 'Checking internal link opportunities…'];
  if (/improve|optimi/.test(s)) return ['Reading the page…', 'Comparing against ranking pages…', 'Ranking changes by expected lift…'];
  if (/keyword|rank/.test(s)) return ['Querying keyword data…', 'Cross-referencing Search Console…'];
  return ['Reading your site data…', 'Checking rankings and coverage…', 'Comparing against competitors…'];
}
