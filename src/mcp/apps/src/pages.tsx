/** Crawled pages: a sortable table of what the crawler measured. */

import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { mount, Header, Pill, Toolbar, ExternalLink, shortUrl, type ViewProps } from './shell';
import './app.css';

type Page = {
  url: string;
  title: string;
  metaDesc: string | null;
  h1: string | null;
  statusCode: number | null;
  depth: number;
  wordCount: number;
  inboundLinks: number;
  internalLinks: number;
  indexable: boolean;
  health: string;
  responseMs: number | null;
  impressions: number;
  clicks: number;
  position: number | null;
  schemaTypes: string[];
  imagesMissingAlt: number;
  discoveredVia: string | null;
};

type Data = {
  site: { domain: string; url: string };
  total: number;
  shown: number;
  crawlWasCapped: boolean;
  pages: Page[];
};

type Col = { key: keyof Page; label: string; num?: boolean };

const COLS: Col[] = [
  { key: 'url', label: 'URL' },
  { key: 'statusCode', label: 'Status', num: true },
  { key: 'depth', label: 'Depth', num: true },
  { key: 'wordCount', label: 'Words', num: true },
  { key: 'inboundLinks', label: 'Inbound', num: true },
  { key: 'impressions', label: 'Impr.', num: true },
  { key: 'clicks', label: 'Clicks', num: true },
  { key: 'position', label: 'Pos.', num: true },
  { key: 'responseMs', label: 'ms', num: true },
];

function statusTone(code: number | null) {
  if (code === null) return '';
  if (code >= 500 || code === 404 || code === 410) return 'danger';
  if (code >= 400) return 'warning';
  if (code >= 300) return 'info';
  return 'success';
}

function Pages({ data, app }: ViewProps<Data>) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: keyof Page; dir: 1 | -1 }>({ key: 'depth', dir: 1 });

  const filtered = data.pages.filter(
    (p) => !q || `${p.url} ${p.title}`.toLowerCase().includes(q.toLowerCase()),
  );

  const rows = [...filtered].sort((a, b) => {
    const x = a[sort.key];
    const y = b[sort.key];
    // Nulls last regardless of direction — an unmeasured value is not a zero.
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * sort.dir;
    return String(x).localeCompare(String(y)) * sort.dir;
  });

  const toggle = (key: keyof Page) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'url' ? 1 : -1 }));

  const noIndex = data.pages.filter((p) => !p.indexable).length;

  return (
    <>
      <Header
        title={`Pages — ${data.site.domain}`}
        subtitle={
          data.crawlWasCapped
            ? `${data.shown.toLocaleString('en-US')} of ${data.total.toLocaleString('en-US')} crawled. The crawl hit its page cap, so inbound-link counts are a lower bound.`
            : `${data.shown.toLocaleString('en-US')} of ${data.total.toLocaleString('en-US')} crawled pages`
        }
        stats={[
          { label: 'Pages', value: data.total },
          { label: 'Non-indexable', value: noIndex, tone: noIndex ? 'warning' : '' },
        ]}
      />

      <Toolbar query={q} onQuery={setQ} placeholder="Filter by URL or title…" />

      {rows.length === 0 ? (
        <p className="empty">No page matches “{q}”.</p>
      ) : (
        <div className="wrap">
          <table>
            <thead>
              <tr>
                {COLS.map((c) => (
                  <th
                    key={c.key}
                    className={c.num ? 'num' : ''}
                    aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
                    onClick={() => toggle(c.key)}
                  >
                    {c.label}
                    {sort.key === c.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.url}>
                  <td className="url" title={`${p.url}\n${p.title}`}>
                    <ExternalLink app={app} href={p.url}>
                      {shortUrl(p.url)}
                    </ExternalLink>
                    {!p.indexable ? (
                      <>
                        {' '}
                        <Pill tone="warning">noindex</Pill>
                      </>
                    ) : null}
                  </td>
                  <td className="num">
                    <Pill tone={statusTone(p.statusCode) as never}>{p.statusCode ?? '—'}</Pill>
                  </td>
                  <td className="num">{p.depth}</td>
                  <td className="num">{p.wordCount.toLocaleString('en-US')}</td>
                  <td className="num">{p.inboundLinks.toLocaleString('en-US')}</td>
                  <td className="num">{p.impressions.toLocaleString('en-US')}</td>
                  <td className="num">{p.clicks.toLocaleString('en-US')}</td>
                  <td className="num">{p.position ?? '—'}</td>
                  <td className="num">{p.responseMs ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const Root = mount<Data>('seo-cursor-pages', (p) => <Pages {...p} />);
createRoot(document.getElementById('root')!).render(<Root />);
