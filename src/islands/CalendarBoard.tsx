import { useMemo, useState } from 'react';

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
};

export type CalItem = {
  id: string; date: string; type: string; title: string; status: string;
  autoGenerate: boolean; autoPublish: boolean; ranAt: string | null; runError: string | null;
  ideaId: string | null; contentId: string | null; contentWords: number | null;
  wpUrl: string | null; rationale: string | null; targetQuery: string | null;
};

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export default function CalendarBoard({ items: initial, siteId, wpReady }: { items: CalItem[]; siteId: string; wpReady: boolean }) {
  const today = startOfDay(new Date());
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [open, setOpen] = useState<CalItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: string; text: string }[]>([]);

  const toast = (text: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  };
  const patch = (id: string, data: Partial<CalItem>) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...data } : x)));
    setOpen((o) => (o && o.id === id ? { ...o, ...data } : o));
  };

  const byDay = useMemo(() => {
    const map: Record<string, CalItem[]> = {};
    for (const it of items) {
      const d = new Date(it.date);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      (map[key] ??= []).push(it);
    }
    return map;
  }, [items]);

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

  const upcoming = items
    .filter((i) => new Date(i.date) >= today && i.status !== 'DONE')
    .sort((a, b) => +new Date(a.date) - +new Date(b.date))
    .slice(0, 8);

  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px', alignItems: 'start' }}>
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{MONTHS[cursor.m]} {cursor.y}</div>
              <div className="card-sub">{monthItems.length} scheduled this month</div>
            </div>
            <div className="row">
              <button className="btn btn-sm" onClick={() => shift(-1)}><I d={P.left} s={13} /></button>
              <button className="btn btn-sm" onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })}>Today</button>
              <button className="btn btn-sm" onClick={() => shift(1)}><I d={P.right} s={13} /></button>
            </div>
          </div>

          <div className="cal-grid">
            {DOW.map((d) => <div className="cal-dow" key={d}>{d}</div>)}
            {cells.map((d, i) => {
              const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
              const dayItems = byDay[key] ?? [];
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

        <div className="card">
          <div className="card-head"><div className="card-title">Coming up</div></div>
          <div>
            {upcoming.map((u) => {
              const d = new Date(u.date);
              const overdue = d < today;
              return (
                <div className="up-item" key={u.id} onClick={() => setOpen(u)}>
                  <div className="up-date" style={overdue ? { borderColor: 'var(--amber-line)', background: 'var(--amber-soft)' } : undefined}>
                    <div className="up-mon">{SHORT[d.getMonth()]}</div>
                    <div className="up-day">{d.getDate()}</div>
                  </div>
                  <div className="up-body">
                    <div className="up-title">{u.title}</div>
                    <div style={{ display: 'flex', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
                      {u.autoPublish && <span className="badge green">auto-publish</span>}
                      {u.contentId && <span className="badge amber">written</span>}
                      {u.runError && <span className="badge red">failed</span>}
                    </div>
                  </div>
                </div>
              );
            })}
            {upcoming.length === 0 && <div className="empty">Nothing ahead.</div>}
          </div>
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line-2)', fontSize: 11.5, color: 'var(--ink-4)', lineHeight: 1.55 }}>
            The scheduler checks every 5 minutes while the app is running. In production, point a cron at
            <span className="mono"> /api/scheduler/tick</span>.
          </div>
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

      {toasts.length > 0 && (
        <div className="toasts">
          {toasts.map((t) => <div className="toast" key={t.id}><I d={P.check} s={15} /><span>{t.text}</span></div>)}
        </div>
      )}
    </>
  );
}
