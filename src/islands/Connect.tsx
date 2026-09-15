import { useEffect, useRef, useState } from 'react';

const I = ({ d, s = 14 }: { d: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const P = {
  check: 'M20 6 9 17l-5-5',
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6 6 18M6 6l12 12',
  spark: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
  arrow: 'M5 12h14M12 5l7 7-7 7',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
};

/** The phases the server reports, in the order they occur. */
const PHASES = [
  { key: 'robots', label: 'Reading robots.txt', match: /robots/i },
  { key: 'sitemap', label: 'Discovering sitemap', match: /sitemap/i },
  { key: 'crawl', label: 'Crawling pages', match: /crawling/i },
  { key: 'links', label: 'Checking every link', match: /checking links/i },
  { key: 'analyse', label: 'Analysing findings', match: /analysing/i },
];

type Phase = 'form' | 'crawling' | 'done' | 'error';

export default function Connect() {
  const [phase, setPhase] = useState<Phase>('form');
  const [url, setUrl] = useState('');
  const [competitors, setCompetitors] = useState(['', '']);
  const [maxPages, setMaxPages] = useState(100);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [job, setJob] = useState<any>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (poll.current) clearInterval(poll.current); }, []);

  const setComp = (i: number, v: string) => setCompetitors((c) => c.map((x, j) => (j === i ? v : x)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const body = {
      url: url.trim(),
      competitors: competitors.map((c) => c.trim()).filter(Boolean),
      maxPages,
    };
    if (!body.url) { setErrors({ url: 'Enter your website URL' }); return; }

    setPhase('crawling');
    const res = await fetch('/api/connect', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();

    if (!json.ok) {
      const fieldErrors: Record<string, string> = {};
      if (json.issues) for (const iss of json.issues) fieldErrors[iss.path.split('.')[0] || 'url'] = iss.message;
      setErrors(Object.keys(fieldErrors).length ? fieldErrors : { url: json.error });
      setPhase('form');
      return;
    }

    setSiteId(json.data.siteId);
    watch(json.data.crawlId);
  }

  function watch(crawlId: string) {
    const check = async () => {
      const r = await fetch(`/api/crawl/${crawlId}`).then((x) => x.json()).catch(() => null);
      if (!r?.ok) return;
      setJob(r.data);
      if (r.data.status === 'DONE') {
        if (poll.current) clearInterval(poll.current);
        setPhase('done');
      } else if (r.data.status === 'FAILED') {
        if (poll.current) clearInterval(poll.current);
        setFatal(r.data.error ?? 'The crawl failed.');
        setPhase('error');
      }
    };
    check();
    poll.current = setInterval(check, 900);
  }

  // ------------------------------------------------------------- crawling
  if (phase === 'crawling' || phase === 'error') {
    const currentIdx = job ? PHASES.findIndex((p) => p.match.test(job.phase)) : -1;
    const pagePct = job?.maxPages ? Math.min(100, Math.round((job.pagesCrawled / job.maxPages) * 100)) : 0;
    const overall = currentIdx < 0 ? 4 : Math.round(((currentIdx + (currentIdx === 2 ? pagePct / 100 : 0.5)) / PHASES.length) * 100);

    return (
      <div className="onboard-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          {phase === 'error'
            ? <span style={{ color: 'var(--red)' }}><I d={P.alert} s={16} /></span>
            : <span className="spinner" style={{ color: 'var(--blue)', width: 15, height: 15 }} />}
          <h1 style={{ fontSize: 19, fontWeight: 640, letterSpacing: '-.018em', margin: 0 }}>
            {phase === 'error' ? 'Crawl failed' : `Crawling ${hostOf(url)}…`}
          </h1>
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--ink-3)', margin: '0 0 20px' }}>
          {phase === 'error'
            ? fatal
            : 'Fetching every page we can reach, then checking each link it points at.'}
        </p>

        {phase !== 'error' && (
          <>
            <div className="prog-track" style={{ marginBottom: 18 }}>
              <div className="prog-fill" style={{ width: `${overall}%` }} />
            </div>

            <div style={{ marginBottom: 18 }}>
              {PHASES.map((p, i) => (
                <div key={p.key} className={`step-row ${i < currentIdx ? 'ok' : i === currentIdx ? 'on' : ''}`}>
                  <span className="step-mark">
                    {i < currentIdx ? <I d={P.check} s={11} />
                      : i === currentIdx ? <span className="spinner" style={{ width: 9, height: 9, borderWidth: 1.5 }} />
                      : null}
                  </span>
                  <span>{p.label}</span>
                  {i === currentIdx && i === 2 && job && (
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-4)', fontVariantNumeric: 'tabular-nums' }}>
                      {job.pagesCrawled} / {job.maxPages}
                    </span>
                  )}
                  {i === currentIdx && i === 3 && job && (
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-4)', fontVariantNumeric: 'tabular-nums' }}>
                      {job.linksChecked}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {job && (job.pagesCrawled > 0 || job.brokenLinks > 0) && (
              <div className="meta-grid">
                <div className="meta-cell"><div className="meta-k">Pages</div><div className="meta-v">{job.pagesCrawled}</div></div>
                <div className="meta-cell"><div className="meta-k">Links checked</div><div className="meta-v">{job.linksChecked}</div></div>
                <div className="meta-cell"><div className="meta-k">Broken</div><div className="meta-v" style={{ color: job.brokenLinks ? 'var(--red)' : undefined }}>{job.brokenLinks}</div></div>
              </div>
            )}
          </>
        )}

        {phase === 'error' && (
          <button className="btn btn-lg" onClick={() => { setPhase('form'); setFatal(null); setJob(null); }}>
            Try another URL
          </button>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------- done
  if (phase === 'done' && job?.summary) {
    const s = job.summary;
    return (
      <div className="onboard-card">
        <div style={{ width: 46, height: 46, borderRadius: 99, background: 'var(--green-soft)', border: '1px solid var(--green-line)', display: 'grid', placeItems: 'center', color: 'var(--green)', marginBottom: 16 }}>
          <I d={P.check} s={22} />
        </div>
        <h1 style={{ fontSize: 21, fontWeight: 650, letterSpacing: '-.022em', margin: '0 0 6px' }}>Crawl complete.</h1>
        <p style={{ fontSize: 13.5, color: 'var(--ink-3)', margin: '0 0 22px' }}>
          Everything below was measured on {hostOf(url)}, not estimated.
        </p>

        <div className="meta-grid" style={{ marginBottom: 14 }}>
          <div className="meta-cell"><div className="meta-k">Pages crawled</div><div className="meta-v">{s.pages}</div></div>
          <div className="meta-cell"><div className="meta-k">Links checked</div><div className="meta-v">{s.linksChecked}</div></div>
          <div className="meta-cell"><div className="meta-k">Broken links</div><div className="meta-v" style={{ color: s.brokenLinks ? 'var(--red)' : 'var(--green)' }}>{s.brokenLinks}</div></div>
          <div className="meta-cell"><div className="meta-k">Health score</div><div className="meta-v" style={{ color: s.healthScore >= 70 ? 'var(--green)' : 'var(--amber)' }}>{s.healthScore}</div></div>
          <div className="meta-cell"><div className="meta-k">Findings</div><div className="meta-v">{s.issues}</div></div>
          <div className="meta-cell"><div className="meta-k">Critical</div><div className="meta-v" style={{ color: s.criticalIssues ? 'var(--red)' : 'var(--green)' }}>{s.criticalIssues}</div></div>
        </div>

        <div className="insight" style={{ margin: '0 0 20px' }}>
          <div className="insight-tag"><I d={P.spark} s={11} />Next</div>
          <div className="insight-body">
            Connect Google Search Console to see which of these pages actually rank, and for what.
            Without it the audit is accurate but blind to performance.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="btn btn-primary btn-lg" href={`/audit?site=${siteId}`}>View the audit<I d={P.arrow} s={13} /></a>
          <a className="btn btn-lg" href={`/settings?site=${siteId}`}>Connect Search Console</a>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------- form
  return (
    <form className="onboard-card" onSubmit={submit}>
      <div className="rail-mark" style={{ width: 30, height: 30, borderRadius: 9, marginBottom: 16 }}>S</div>
      <h1 style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-.024em', margin: '0 0 6px' }}>Connect your website</h1>
      <p style={{ fontSize: 14, color: 'var(--ink-3)', margin: '0 0 24px', lineHeight: 1.6 }}>
        We crawl it for real — every page we can reach, every link checked.
      </p>

      <div className="field">
        <label className="field-label">Website URL</label>
        <input
          className="input mono"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoFocus
          style={errors.url ? { borderColor: 'var(--red)' } : undefined}
        />
        {errors.url && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 5 }}>{errors.url}</div>}
      </div>

      <div className="field">
        <label className="field-label">Competitor websites <span style={{ fontWeight: 400, color: 'var(--ink-4)' }}>· optional</span></label>
        {competitors.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 7 }}>
            <input
              className="input mono"
              placeholder={`https://competitor${i + 1}.com`}
              value={c}
              onChange={(e) => setComp(i, e.target.value)}
              style={errors.competitors ? { borderColor: 'var(--red)' } : undefined}
            />
            {competitors.length > 1 && (
              <button type="button" className="btn" onClick={() => setCompetitors((cs) => cs.filter((_, j) => j !== i))} style={{ flex: '0 0 auto', height: 38 }}>
                <I d={P.x} s={13} />
              </button>
            )}
          </div>
        ))}
        {errors.competitors && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 2, marginBottom: 6 }}>{errors.competitors}</div>}
        {competitors.length < 8 && (
          <button type="button" className="btn btn-sm" onClick={() => setCompetitors((c) => [...c, ''])}>
            <I d={P.plus} s={12} />Add competitor
          </button>
        )}
      </div>

      <div className="field">
        <label className="field-label">Page limit for this crawl</label>
        <select className="input" value={maxPages} onChange={(e) => setMaxPages(Number(e.target.value))}>
          <option value={25}>25 pages — quick look</option>
          <option value={100}>100 pages — recommended</option>
          <option value={250}>250 pages</option>
          <option value={500}>500 pages — thorough, slower</option>
        </select>
      </div>

      <button className="btn btn-primary btn-lg btn-block" type="submit" style={{ marginTop: 8 }}>
        <I d={P.spark} s={14} />Crawl my website
      </button>

      <p style={{ fontSize: 11.5, color: 'var(--ink-4)', textAlign: 'center', margin: '14px 0 0', lineHeight: 1.5 }}>
        We respect robots.txt and crawl-delay. Typically 30 seconds to a few minutes.
      </p>
    </form>
  );
}

const hostOf = (u: string) => {
  try { return new URL(/^https?:\/\//.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, ''); }
  catch { return u; }
};
