import { useEffect, useMemo, useRef, useState } from 'react';

const I = ({ d, s = 14 }: { d: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const P = {
  x: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  spark: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  rocket: 'M5 3l14 9-14 9z',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  star: 'M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.8 5.9 20.4l1.4-6.8L2.2 9l6.9-.7z',
  arrowRight: 'M5 12h14M12 5l7 7-7 7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  key: 'M15 2a7 7 0 0 0-6.6 9.3L2 17.7V22h4.3l1.4-1.4V19h1.6l1.4-1.4v-1.6h1.6l1-1A7 7 0 1 0 15 2M17 7h.01',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
};

export type CalItem = {
  id: string; date: string; type: string; title: string; status: string;
  autoGenerate: boolean; autoPublish: boolean; ranAt: string | null; runError: string | null;
  ideaId: string | null; contentId: string | null; contentWords: number | null;
  wpUrl: string | null; rationale: string | null; targetQuery: string | null;
};

export type KeywordRow = {
  id: string; keyword: string; volume: number; difficulty: number;
  competition: 'Low' | 'Medium' | 'High' | 'N/A';
  impressions: number; position: number | null;
  opportunity: 'High' | 'Medium' | 'Low';
  source: 'volume' | 'gsc' | 'none';
  intent: string; tracked: boolean;
};

export type FetchStatus = {
  ran: boolean; cached: boolean;
  gscConnected: boolean; gscKeywords: number | null;
  volumeProvider: 'keywords-everywhere' | 'bing' | 'google-ads' | null;
  needsMarket: boolean; enriched: number | null; errors: string[];
};

export type AdsCountry = { geoTarget: number; name: string; iso: string };
export type AdsLanguage = { id: number; name: string };

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const COMP_CLASS: Record<KeywordRow['competition'], string> = { Low: 'green', Medium: 'amber', High: 'red', 'N/A': 'gray' };
const OPP_CLASS: Record<KeywordRow['opportunity'], string> = { High: 'green', Medium: 'amber', Low: 'gray' };

/** The metric line under a keyword — real volume if we have it, else Search Console. */
function kwMetric(k: KeywordRow): string {
  if (k.source === 'volume') return `Volume: ${k.volume.toLocaleString()} / mo`;
  if (k.source === 'gsc') return `Impressions: ${k.impressions.toLocaleString()} / mo${k.position ? ` · Pos ${Math.round(k.position)}` : ''}`;
  return 'No data yet';
}
/** The chip beside a keyword — competition when priced, otherwise GSC opportunity. */
function kwChip(k: KeywordRow): { text: string; cls: string; title: string } {
  if (k.source === 'volume') return { text: k.competition, cls: COMP_CLASS[k.competition], title: 'Ad competition' };
  if (k.source === 'gsc') return { text: k.opportunity, cls: OPP_CLASS[k.opportunity], title: 'Search Console opportunity' };
  return { text: 'N/A', cls: 'gray', title: 'No data yet' };
}

/** What to tell the user about where the keyword list came from, and any gap. */
function sourceNote(status: FetchStatus | null, siteId: string):
  | { tone: 'warn' | 'ok'; text: string; href?: string; cta?: string }
  | null {
  if (!status) return null;
  if (status.errors.length) return { tone: 'warn', text: status.errors[0] };
  if (status.needsMarket) return null; // the Google Ads market picker is shown instead
  if (!status.gscConnected)
    return { tone: 'warn', text: 'Connect Search Console to import your ranking queries.', href: `/settings?site=${siteId}`, cta: 'Connect' };
  if (!status.volumeProvider)
    return { tone: 'ok', text: 'Volume from Search Console impressions. Add a Keywords Everywhere API key for Google search volume.' };
  const providerName =
    status.volumeProvider === 'keywords-everywhere' ? 'Keywords Everywhere'
    : status.volumeProvider === 'bing' ? 'Bing' : 'Google Ads';
  const parts: string[] = [];
  if (status.gscKeywords != null) parts.push(`${status.gscKeywords} from Search Console`);
  if (status.enriched != null) parts.push(`${status.enriched} priced by ${providerName}`);
  return { tone: 'ok', text: parts.length ? `Pulled ${parts.join(' · ')}.` : `Volume from ${providerName} + Search Console.` };
}

/** Title-case a bare keyword so an auto-named article reads like a headline. */
function titleFromKeyword(keyword: string): string {
  const small = new Set(['a', 'an', 'and', 'the', 'for', 'of', 'to', 'in', 'on', 'with', 'vs']);
  return keyword
    .split(/\s+/)
    .map((w, i) => (i > 0 && small.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

export default function CalendarBoard({
  items: initial, siteId, wpReady, keywords = [],
}: { items: CalItem[]; siteId: string; wpReady: boolean; keywords?: KeywordRow[] }) {
  const today = startOfDay(new Date());
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [open, setOpen] = useState<CalItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: string; text: string }[]>([]);
  const [query, setQuery] = useState('');
  const [scheduling, setScheduling] = useState(false);

  const toast = (text: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  };
  const patch = (id: string, data: Partial<CalItem>) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...data } : x)));
    setOpen((o) => (o && o.id === id ? { ...o, ...data } : o));
  };

  const q = query.trim().toLowerCase();
  const byDay = useMemo(() => {
    const map: Record<string, CalItem[]> = {};
    for (const it of items) {
      if (q && !it.title.toLowerCase().includes(q)) continue;
      (map[dayKey(new Date(it.date))] ??= []).push(it);
    }
    return map;
  }, [items, q]);

  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const shift = (n: number) => {
    let m = cursor.m + n, y = cursor.y;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setCursor({ y, m });
  };

  const monthItems = items.filter((i) => {
    const d = new Date(i.date);
    return d.getFullYear() === cursor.y && d.getMonth() === cursor.m;
  });

  // ------------------------------------------------------------- actions

  async function generateNow(item: CalItem) {
    if (!item.ideaId) return;
    setBusy(item.id); setError(null); setPhase('Planning the outline…');
    const slow = setTimeout(() => setPhase('Writing the sections…'), 6000);
    const r = await fetch('/api/blog/generate', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, ideaId: item.ideaId }),
    }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    clearTimeout(slow);
    setBusy(null); setPhase('');
    if (!r.ok) { setError(r.error); return; }
    patch(item.id, { contentId: r.data.id, contentWords: r.data.wordCount, status: 'DONE', ranAt: new Date().toISOString() });
    toast(`Written — ${r.data.wordCount.toLocaleString()} words`);
  }

  async function publish(item: CalItem) {
    if (!item.contentId) return;
    setBusy(item.id); setError(null);
    const r = await fetch('/api/blog/publish', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contentId: item.contentId, status: 'publish', confirm: true }),
    }).then((x) => x.json());
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    patch(item.id, { wpUrl: r.data.url, status: 'DONE' });
    toast('Published to WordPress');
  }

  async function move(item: CalItem, days: number) {
    const next = new Date(new Date(item.date).getTime() + days * 86_400_000);
    setBusy(item.id);
    const r = await fetch('/api/ideas/schedule', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, ideaId: item.ideaId, date: next.toISOString(), autoGenerate: item.autoGenerate, autoPublish: item.autoPublish }),
    }).then((x) => x.json());
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    patch(item.id, { date: next.toISOString(), ranAt: null, runError: null, status: 'PLANNED' });
    toast(`Moved to ${SHORT[next.getMonth()]} ${next.getDate()}`);
  }

  async function toggleAutoPublish(item: CalItem) {
    setBusy(item.id);
    const r = await fetch('/api/ideas/schedule', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, ideaId: item.ideaId, date: item.date, autoGenerate: item.autoGenerate, autoPublish: !item.autoPublish }),
    }).then((x) => x.json());
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    patch(item.id, { autoPublish: !item.autoPublish });
  }

  // On success the board gets the created item appended and jumps to its month.
  function onScheduled(item: CalItem) {
    setItems((xs) => [...xs.filter((x) => x.id !== item.id), item]);
    const d = new Date(item.date);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    toast(`Scheduled for ${SHORT[d.getMonth()]} ${d.getDate()}`);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="h1">Calendar</h1>
          <p className="sub">Schedule &amp; customize upcoming articles</p>
        </div>
      </div>

      <div className="card">
        <div className="cal-toolbar">
          <div>
            <div className="card-title" style={{ fontSize: 16 }}>{MONTHS[cursor.m]} {cursor.y}</div>
            <div className="card-sub">{monthItems.length} scheduled this month</div>
          </div>
          <div className="cal-tools">
            <div className="cal-search">
              <I d={P.search} s={14} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search articles"
                aria-label="Search articles"
              />
              {query && <button className="cal-search-x" onClick={() => setQuery('')} aria-label="Clear"><I d={P.x} s={12} /></button>}
            </div>
            <div className="cal-nav">
              <button className="cal-nav-btn" onClick={() => shift(-1)} aria-label="Previous month"><I d={P.left} s={14} /></button>
              <button className="cal-nav-btn" onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })}>Today</button>
              <button className="cal-nav-btn" onClick={() => shift(1)} aria-label="Next month"><I d={P.right} s={14} /></button>
            </div>
            <button className="btn btn-primary" onClick={() => { setScheduling(true); }}>
              <I d={P.plus} s={14} />Schedule Article
            </button>
          </div>
        </div>

        <div className="cal-grid">
          {DOW.map((d) => <div className="cal-dow" key={d}>{d}</div>)}
          {cells.map((d, i) => {
            const dayItems = byDay[dayKey(d)] ?? [];
            const outside = d.getMonth() !== cursor.m;
            const isToday = d.getTime() === today.getTime();
            return (
              <div className={`cal-cell ${outside ? 'out' : ''} ${isToday ? 'today' : ''}`} key={i}>
                <div className="cal-num">
                  {isToday && <span className="cal-today-dot" />}
                  {d.getDate()}
                </div>
                {dayItems.map((it) => (
                  <button
                    key={it.id}
                    className={`cal-chip t-${it.type} ${it.status === 'DONE' ? 'done' : ''}`}
                    onClick={() => { setOpen(it); setError(null); }}
                  >
                    <div className="cal-chip-type">
                      {it.contentId ? 'Written' : it.autoPublish ? 'Auto-publish' : 'Blog'}
                    </div>
                    <div className="cal-chip-title">{it.title}</div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {open && (
        <>
          <div className="scrim" onClick={() => setOpen(null)} />
          <aside className="drawer">
            <div className="drawer-head">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 7, marginBottom: 7, flexWrap: 'wrap' }}>
                  <span className="badge blue">{new Date(open.date).toLocaleDateString()}</span>
                  <span className={`badge ${open.status === 'DONE' ? 'green' : 'gray'}`}>
                    {open.status === 'IN_PROGRESS' ? 'In progress' : open.status[0] + open.status.slice(1).toLowerCase()}
                  </span>
                  {open.autoPublish && <span className="badge green">auto-publish</span>}
                  {open.contentWords && <span className="badge amber">{open.contentWords.toLocaleString()} words</span>}
                </div>
                <h2 className="h2" style={{ lineHeight: 1.3 }}>{open.title}</h2>
                {open.targetQuery && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 5 }}>Target: “{open.targetQuery}”</div>}
              </div>
              <button className="x-btn" onClick={() => setOpen(null)}><I d={P.x} /></button>
            </div>

            <div className="drawer-body">
              {open.rationale && (
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 620, margin: '0 0 6px' }}>Why this is scheduled</h3>
                  <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6, margin: 0 }}>{open.rationale}</p>
                </div>
              )}

              <div className="meta-grid" style={{ marginBottom: 18 }}>
                <div className="meta-cell"><div className="meta-k">On the day</div><div className="meta-v" style={{ fontSize: 13 }}>{open.autoGenerate ? 'Writes itself' : 'Manual'}</div></div>
                <div className="meta-cell"><div className="meta-k">Then</div><div className="meta-v" style={{ fontSize: 13 }}>{open.autoPublish ? 'Publishes' : 'Waits for you'}</div></div>
                <div className="meta-cell"><div className="meta-k">Draft</div><div className="meta-v" style={{ fontSize: 13 }}>{open.contentId ? 'Ready' : 'Not written'}</div></div>
              </div>

              <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, color: 'var(--ink-2)', padding: '11px 13px', border: '1px solid var(--line)', borderRadius: 9, cursor: wpReady ? 'pointer' : 'not-allowed', opacity: wpReady ? 1 : 0.55 }}>
                <input type="checkbox" checked={open.autoPublish} disabled={!wpReady || !!busy} onChange={() => toggleAutoPublish(open)} style={{ marginTop: 2 }} />
                <span>
                  Publish to WordPress automatically when it is written
                  {!wpReady && <span style={{ color: 'var(--ink-4)' }}> — connect WordPress first</span>}
                </span>
              </label>

              {open.runError && (
                <div style={{ display: 'flex', gap: 9, padding: '10px 12px', background: 'var(--red-soft)', border: '1px solid var(--red-line)', borderRadius: 8, marginTop: 16, fontSize: 12.5, color: '#991b1b' }}>
                  <I d={P.alert} s={14} /><span>{open.runError}</span>
                </div>
              )}
              {error && (
                <div style={{ display: 'flex', gap: 9, padding: '10px 12px', background: 'var(--red-soft)', border: '1px solid var(--red-line)', borderRadius: 8, marginTop: 16, fontSize: 12.5, color: '#991b1b' }}>
                  <I d={P.alert} s={14} /><span>{error}</span>
                </div>
              )}
              {busy === open.id && phase && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 16, fontSize: 13, color: 'var(--ink-3)' }}>
                  <span className="spinner" style={{ color: 'var(--blue)' }} />{phase}
                </div>
              )}
            </div>

            <div className="drawer-foot" style={{ flexWrap: 'wrap' }}>
              {!open.contentId && (
                <button className="btn btn-ai" disabled={busy === open.id} onClick={() => generateNow(open)}>
                  <I d={P.spark} s={13} />Generate now
                </button>
              )}
              {open.contentId && (
                <a className="btn" href={`/studio?site=${siteId}&doc=${open.contentId}`}><I d={P.doc} s={13} />Open draft</a>
              )}
              {open.contentId && !open.wpUrl && (
                <button className="btn btn-primary" disabled={!wpReady || busy === open.id} onClick={() => publish(open)}>
                  <I d={P.rocket} s={13} />Publish
                </button>
              )}
              {open.wpUrl && <a className="btn" href={open.wpUrl} target="_blank" rel="noreferrer">View live</a>}
              <button className="btn" disabled={busy === open.id} onClick={() => move(open, 7)}>Push a week</button>
            </div>
          </aside>
        </>
      )}

      {scheduling && (
        <ScheduleModal
          siteId={siteId}
          wpReady={wpReady}
          keywords={keywords}
          items={items}
          onClose={() => setScheduling(false)}
          onScheduled={(it) => { onScheduled(it); setScheduling(false); }}
        />
      )}

      {toasts.length > 0 && (
        <div className="toasts">
          {toasts.map((t) => <div className="toast" key={t.id}><I d={P.check} s={15} /><span>{t.text}</span></div>)}
        </div>
      )}
    </>
  );
}

// ================================================================ schedule modal

function ScheduleModal({
  siteId, wpReady, keywords, items, onClose, onScheduled,
}: {
  siteId: string; wpReady: boolean; keywords: KeywordRow[]; items: CalItem[];
  onClose: () => void; onScheduled: (it: CalItem) => void;
}) {
  // Default to the first future day with nothing on it, at 02:00 local.
  const defaultDate = useMemo(() => {
    const taken = new Set(items.map((i) => dayKey(new Date(i.date))));
    const d = startOfDay(new Date());
    for (let i = 1; i <= 365; i++) {
      d.setDate(d.getDate() + 1);
      if (!taken.has(dayKey(d))) break;
    }
    d.setHours(2, 0, 0, 0);
    return d;
  }, [items]);

  const [kwSearch, setKwSearch] = useState('');
  const [rows, setRows] = useState<KeywordRow[]>(keywords);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<FetchStatus | null>(null);
  const [selected, setSelected] = useState<KeywordRow | null>(null);
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [dateStr, setDateStr] = useState(() => {
    const d = defaultDate;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [autoPublish, setAutoPublish] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // --- Google Ads market picker (shown only when no market is connected) ---
  const [countries, setCountries] = useState<AdsCountry[]>([]);
  const [languages, setLanguages] = useState<AdsLanguage[]>([]);
  const [defaultLangByIso, setDefaultLangByIso] = useState<Record<string, number>>({});
  const [locLoading, setLocLoading] = useState(false);
  const [country, setCountry] = useState<number | ''>('');
  const [lang, setLang] = useState<number | ''>('');
  const [connecting, setConnecting] = useState(false);
  const [marketErr, setMarketErr] = useState<string | null>(null);

  // --- add-your-own keywords ---
  const [adding, setAdding] = useState(false);
  const [addText, setAddText] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);
  const [seed, setSeed] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  async function suggestKeywords() {
    setAiBusy(true); setAddErr(null);
    const r = await fetch('/api/keywords/suggest', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, seed, count: 20 }),
    }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    setAiBusy(false);
    if (!r.ok) { setAddErr(r.error || 'Could not suggest keywords'); return; }
    const have = new Set(addText.split(/[\n,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean));
    const fresh = (r.data.keywords as string[]).filter((k) => !have.has(k.toLowerCase()));
    const base = addText.trim();
    setAddText((base ? base + '\n' : '') + fresh.join('\n'));
  }

  async function addKeywords() {
    const kws = addText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    if (!kws.length) { setAddErr('Enter at least one keyword'); return; }
    setAddBusy(true); setAddErr(null);
    const r = await fetch('/api/keywords/add', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, keywords: kws }),
    }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    setAddBusy(false);
    if (!r.ok) { setAddErr(r.error || 'Could not add keywords'); return; }
    setAdding(false); setAddText('');
    await loadKeywords(true); // refresh the list (and price them if a provider is set up)
  }

  const needsMarket = !!status?.needsMarket;
  const selCountry = countries.find((c) => c.geoTarget === country);

  async function loadMarkets() {
    if (countries.length || locLoading) return;
    setLocLoading(true);
    const r = await fetch('/api/keywords/ads/markets').then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    setLocLoading(false);
    if (r.ok) {
      setCountries(r.data.countries);
      setLanguages(r.data.languages);
      setDefaultLangByIso(r.data.defaultLanguageByIso ?? {});
    } else {
      setMarketErr(r.error || 'Could not load markets');
    }
  }

  function chooseCountry(code: number | '') {
    setCountry(code);
    const c = countries.find((x) => x.geoTarget === code);
    setLang(c ? (defaultLangByIso[c.iso] ?? 1000) : ''); // default to English
  }

  async function connectMarket() {
    if (!country || !lang) { setMarketErr('Pick a country and language'); return; }
    setConnecting(true); setMarketErr(null);
    const r = await fetch('/api/keywords/ads/connect', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, geoTarget: country, languageId: lang }),
    }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    setConnecting(false);
    if (!r.ok) { setMarketErr(r.error || 'Could not connect market'); return; }
    await loadKeywords(true); // now pull volume & competition from Google Ads
  }

  async function loadKeywords(force: boolean) {
    setLoading(true);
    const r = await fetch('/api/keywords/fetch', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, force }),
    }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    setLoading(false);
    if (!r.ok) {
      setStatus((s) => ({ ...(s ?? ({} as FetchStatus)), errors: [r.error || 'Could not fetch keywords'] } as FetchStatus));
      return;
    }
    setRows(r.data.keywords);
    setStatus(r.data.status);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    searchRef.current?.focus();
    // Pull fresh keywords from Search Console + DataForSEO when the scheduler opens.
    loadKeywords(false);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Once we know a market is missing, load the country/language options to pick from.
  useEffect(() => { if (needsMarket) loadMarkets(); }, [needsMarket]);

  const filtered = useMemo(() => {
    const s = kwSearch.trim().toLowerCase();
    const list = s ? rows.filter((k) => k.keyword.toLowerCase().includes(s)) : rows;
    return list.slice(0, 40);
  }, [kwSearch, rows]);

  function pick(k: KeywordRow) {
    setSelected(k);
    if (!titleTouched) setTitle(titleFromKeyword(k.keyword));
    setErr(null);
  }
  function clearSelection() {
    setSelected(null);
    if (!titleTouched) setTitle('');
  }

  const scheduledAt = useMemo(() => {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, 2, 0, 0, 0);
  }, [dateStr]);

  const canSchedule = !!scheduledAt && (!!selected || title.trim().length >= 3) && !saving;

  async function schedule() {
    if (!scheduledAt) { setErr('Pick a date'); return; }
    setSaving(true); setErr(null);
    const r = await fetch('/api/calendar/new', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        siteId,
        title: title.trim(),
        keyword: selected?.keyword ?? '',
        date: scheduledAt.toISOString(),
        autoPublish,
      }),
    }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    setSaving(false);
    if (!r.ok) { setErr(r.error || 'Could not schedule'); return; }
    onScheduled(r.data as CalItem);
  }

  const niceWhen = scheduledAt
    ? scheduledAt.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—';

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal sched-modal" role="dialog" aria-modal="true" aria-label="Schedule new article">
        <div className="sched-head">
          <h2 className="h2">Schedule New Article</h2>
          <button className="x-btn" onClick={onClose} aria-label="Close"><I d={P.x} /></button>
        </div>

        <div className="sched-body">
          <div className="sched-left">
            <div className="sched-left-head">
              <div className="sched-section-title">Select Keyword</div>
              <button className="sched-refresh" onClick={() => loadKeywords(true)} disabled={loading} title="Re-pull from Search Console & DataForSEO">
                {loading ? <span className="spinner" /> : <I d={P.refresh} s={13} />}
                {loading ? 'Fetching…' : 'Refresh'}
              </button>
            </div>
            <div className="cal-search sched-kw-search">
              <I d={P.search} s={14} />
              <input
                ref={searchRef}
                value={kwSearch}
                onChange={(e) => setKwSearch(e.target.value)}
                placeholder="Search existing keywords…"
                aria-label="Search existing keywords"
              />
            </div>

            <div className="sched-kw-list">
              {loading && rows.length === 0 && (
                <div className="sched-kw-empty">
                  <span className="spinner" style={{ color: 'var(--blue)' }} /> Fetching keywords from Search Console &amp; DataForSEO…
                </div>
              )}
              {!loading && filtered.length === 0 && (
                <div className="sched-kw-empty">
                  {rows.length === 0 ? 'No keywords found yet — connect a market for DataForSEO, or continue without one.' : 'No keywords match that search.'}
                </div>
              )}
              {filtered.map((k) => (
                <button
                  key={k.id}
                  className={`sched-kw ${selected?.id === k.id ? 'on' : ''}`}
                  onClick={() => pick(k)}
                >
                  <div className="sched-kw-main">
                    <div className="sched-kw-name">
                      {k.keyword}
                      {k.tracked && <span className="sched-kw-star"><I d={P.star} s={12} /></span>}
                    </div>
                    <div className="sched-kw-meta">{kwMetric(k)}</div>
                  </div>
                  {(() => { const c = kwChip(k); return <span className={`badge ${c.cls}`} title={c.title}>{c.text}</span>; })()}
                </button>
              ))}
            </div>

            {needsMarket ? (
              <div className="sched-market">
                <div className="sched-market-head">
                  <I d={P.alert} s={13} /><span>Pick a Google Ads market for volume &amp; competition</span>
                </div>
                <div className="sched-market-row">
                  <select
                    className="sched-sel"
                    value={country}
                    disabled={locLoading || connecting}
                    onChange={(e) => chooseCountry(e.target.value ? Number(e.target.value) : '')}
                    aria-label="Country"
                  >
                    <option value="">{locLoading ? 'Loading countries…' : 'Country'}</option>
                    {countries.map((c) => <option key={c.geoTarget} value={c.geoTarget}>{c.name}</option>)}
                  </select>
                  <select
                    className="sched-sel"
                    value={lang}
                    disabled={!selCountry || connecting}
                    onChange={(e) => setLang(e.target.value ? Number(e.target.value) : '')}
                    aria-label="Language"
                  >
                    <option value="">Language</option>
                    {languages.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <button className="btn btn-sm btn-primary" disabled={!country || !lang || connecting} onClick={connectMarket}>
                    {connecting ? <><span className="spinner" style={{ color: '#fff' }} />Connecting…</> : 'Connect & fetch'}
                  </button>
                </div>
                {marketErr && <div className="sched-market-err"><I d={P.alert} s={12} />{marketErr}</div>}
              </div>
            ) : (() => {
              const note = sourceNote(status, siteId);
              if (!note) return null;
              return (
                <div className={`sched-source ${note.tone}`}>
                  <I d={note.tone === 'ok' ? P.check : P.alert} s={13} />
                  <span>{note.text}</span>
                  {note.href && <a href={note.href}>{note.cta}</a>}
                </div>
              );
            })()}

            {adding ? (
              <div className="sched-add">
                <div className="sched-add-ai">
                  <input
                    className="input sched-seed"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    placeholder="Optional: a topic to focus on"
                    disabled={aiBusy}
                  />
                  <button className="btn btn-sm btn-ai" onClick={suggestKeywords} disabled={aiBusy}>
                    {aiBusy ? <><span className="spinner" style={{ color: '#fff' }} />Thinking…</> : <><I d={P.spark} s={13} />Suggest with AI</>}
                  </button>
                </div>
                <textarea
                  className="sched-add-ta"
                  value={addText}
                  onChange={(e) => setAddText(e.target.value)}
                  placeholder={'Paste keywords, one per line — or use Suggest with AI\ngym management software\nclass booking app'}
                  rows={4}
                />
                {addErr && <div className="sched-market-err"><I d={P.alert} s={12} />{addErr}</div>}
                <div className="sched-add-row">
                  <button className="btn btn-sm" onClick={() => { setAdding(false); setAddErr(null); }} disabled={addBusy}>Cancel</button>
                  <button className="btn btn-sm btn-primary" onClick={addKeywords} disabled={addBusy || !addText.trim()}>
                    {addBusy ? <><span className="spinner" style={{ color: '#fff' }} />Adding…</> : 'Add keywords'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="sched-kw-foot">
                <a className="btn btn-sm" href={`/keywords?site=${siteId}`}><I d={P.key} s={13} />View All Keywords</a>
                <button className="btn btn-sm btn-primary" onClick={() => { setAdding(true); setAddErr(null); }}><I d={P.plus} s={13} />Add keywords</button>
              </div>
            )}
          </div>

          <div className="sched-right">
            {selected ? (
              <div className="sched-picked">
                <div className="sched-section-title">Targeting</div>
                <div className="sched-picked-name">{selected.keyword}</div>
                {selected.source === 'volume' ? (
                  <>
                    <div className="sched-picked-row"><span>Search volume</span><b>{selected.volume.toLocaleString()} / mo</b></div>
                    <div className="sched-picked-row"><span>Competition</span><span className={`badge ${COMP_CLASS[selected.competition]}`}>{selected.competition}</span></div>
                  </>
                ) : selected.source === 'gsc' ? (
                  <>
                    <div className="sched-picked-row"><span>Impressions</span><b>{selected.impressions.toLocaleString()} / mo</b></div>
                    {selected.position != null && <div className="sched-picked-row"><span>Your position</span><b>{selected.position.toFixed(1)}</b></div>}
                    <div className="sched-picked-row"><span>Opportunity</span><span className={`badge ${OPP_CLASS[selected.opportunity]}`}>{selected.opportunity}</span></div>
                  </>
                ) : (
                  <div className="sched-picked-row"><span>No data yet</span></div>
                )}
                <button className="link-btn" onClick={clearSelection}>Clear selection</button>
              </div>
            ) : (
              <div className="sched-none">
                <div className="sched-none-title">No keyword selected</div>
                <p className="sched-none-body">
                  Select a keyword to target for this article (optional). The article is scheduled for
                  generation on <b>{niceWhen}</b>.
                </p>
              </div>
            )}

            <label className="field" style={{ marginTop: 18 }}>
              <span className="field-label">Article topic</span>
              <input
                className="input"
                value={title}
                onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }}
                placeholder={selected ? titleFromKeyword(selected.keyword) : 'e.g. How to get started with SEO'}
              />
            </label>

            <label className="field">
              <span className="field-label">Generate on</span>
              <input className="input" type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
            </label>

            <div className="sched-when"><I d={P.clock} s={13} /><span>Writes itself on {niceWhen}</span></div>

            <label
              className="sched-autopub"
              style={{ cursor: wpReady ? 'pointer' : 'not-allowed', opacity: wpReady ? 1 : 0.55 }}
            >
              <input type="checkbox" checked={autoPublish} disabled={!wpReady} onChange={(e) => setAutoPublish(e.target.checked)} />
              <span>Publish to WordPress automatically{!wpReady && <span style={{ color: 'var(--ink-4)' }}> — connect WordPress first</span>}</span>
            </label>

            {err && (
              <div className="sched-err"><I d={P.alert} s={14} /><span>{err}</span></div>
            )}
          </div>
        </div>

        <div className="sched-foot">
          <button className="link-btn" onClick={clearSelection} disabled={!selected}>
            Continue without keyword <I d={P.arrowRight} s={13} />
          </button>
          <div className="row">
            <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={schedule} disabled={!canSchedule}>
              {saving ? <><span className="spinner" style={{ color: '#fff' }} />Scheduling…</> : 'Schedule'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
