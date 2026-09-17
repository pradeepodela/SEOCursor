/** Audit findings: triage by severity and category, resolve in place. */

import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { mount, Header, Pill, Toolbar, Segmented, type ViewProps } from './shell';
import './app.css';

type Issue = {
  id: string;
  code: string;
  title: string;
  category: string;
  severity: 'CRITICAL' | 'WARNING' | 'PASSED';
  affectedUrl: string | null;
  affectedCount: number;
  samples: string[];
  whyItMatters: string;
  recommendedAction: string;
  aiFixable: boolean;
  resolved: boolean;
};

type Data = {
  site: { domain: string };
  total: number;
  critical?: number;
  warnings?: number;
  passed: number;
  byCategory: Record<string, number>;
  issues: Issue[];
};

function Audit({ data, call }: ViewProps<Data>) {
  const [rows, setRows] = useState(data.issues);
  const [sev, setSev] = useState<'ALL' | 'CRITICAL' | 'WARNING'>('ALL');
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const open = rows.filter((r) => !r.resolved);
  const categories = useMemo(
    () => ['All', ...[...new Set(data.issues.map((i) => i.category))].sort()],
    [data.issues],
  );

  const shown = open.filter(
    (r) =>
      (sev === 'ALL' || r.severity === sev) &&
      (cat === 'All' || r.category === cat) &&
      (!q || `${r.title} ${r.recommendedAction} ${r.affectedUrl ?? ''}`.toLowerCase().includes(q.toLowerCase())),
  );

  const resolve = async (issue: Issue) => {
    setBusy(issue.id);
    const r = await call<{ resolved: boolean }>('resolve_issue', { issueId: issue.id, resolved: true });
    if (r?.resolved) setRows((prev) => prev.map((x) => (x.id === issue.id ? { ...x, resolved: true } : x)));
    setBusy(null);
  };

  const critical = open.filter((r) => r.severity === 'CRITICAL').length;
  const warnings = open.filter((r) => r.severity === 'WARNING').length;

  return (
    <>
      <Header
        title={`Audit — ${data.site.domain}`}
        subtitle={`${open.length.toLocaleString('en-US')} open findings`}
        stats={[
          { label: 'Critical', value: critical, tone: 'danger' },
          { label: 'Warnings', value: warnings, tone: 'warning' },
          { label: 'Passed', value: data.passed, tone: 'success' },
        ]}
      />

      <Toolbar query={q} onQuery={setQ} placeholder="Filter findings…">
        <Segmented
          value={sev}
          onChange={setSev}
          options={[
            { value: 'ALL', label: 'All', count: open.length },
            { value: 'CRITICAL', label: 'Critical', count: critical },
            { value: 'WARNING', label: 'Warnings', count: warnings },
          ]}
        />
        {categories.length > 2 ? (
          <select className="search" style={{ flex: '0 0 auto' }} value={cat} onChange={(e) => setCat(e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === 'All' ? 'All categories' : c}
              </option>
            ))}
          </select>
        ) : null}
      </Toolbar>

      {shown.length === 0 ? (
        <p className="empty">
          {open.length === 0 ? 'Nothing open — every check passed.' : 'No findings match this filter.'}
        </p>
      ) : (
        <div className="cards">
          {shown.map((issue) => (
            <article key={issue.id} className={`card ${issue.severity === 'CRITICAL' ? 'crit' : 'warn'}`}>
              <div className="row">
                <Pill tone={issue.severity === 'CRITICAL' ? 'danger' : 'warning'}>{issue.severity}</Pill>
                <Pill>{issue.category}</Pill>
                <Pill tone="info">
                  {issue.affectedCount.toLocaleString('en-US')} page{issue.affectedCount === 1 ? '' : 's'}
                </Pill>
              </div>

              <h2>{issue.title}</h2>
              <p>{issue.whyItMatters}</p>
              <p className="fix">{issue.recommendedAction}</p>

              {issue.samples.length ? (
                <ul>
                  {issue.samples.slice(0, 5).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                  {issue.samples.length > 5 ? <li>…and {issue.samples.length - 5} more</li> : null}
                </ul>
              ) : null}

              <div className="actions">
                <button className="act" type="button" disabled={busy === issue.id} onClick={() => void resolve(issue)}>
                  {busy === issue.id ? 'Resolving…' : 'Mark resolved'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

const Root = mount<Data>('seo-cursor-audit', (p) => <Audit {...p} />);
createRoot(document.getElementById('root')!).render(<Root />);
