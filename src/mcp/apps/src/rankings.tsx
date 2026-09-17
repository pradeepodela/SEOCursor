/**
 * Search rankings.
 *
 * The default view is the two groups worth acting on rather than the whole
 * list: queries sitting on page two, and queries earning impressions but no
 * clicks. Sorting the full set by impressions puts the queries you already win
 * at the top, which is the least useful thing to look at.
 */

import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { mount, Header, Pill, Toolbar, Segmented, ExternalLink, shortUrl, type ViewProps } from './shell';
import './app.css';

type Keyword = {
  keyword: string;
  position: number | null;
  impressions: number;
  clicks: number;
  ctr: number;
  intent: string;
  opportunity: 'HIGH' | 'MEDIUM' | 'LOW';
  volume: number | null;
  difficulty: number | null;
  source: string;
  url: string | null;
};

type Data = {
  site: { domain: string };
  property: string | null;
  lastSyncAt: string | null;
  total: number;
  shown: number;
  nearMiss: number;
  noClicks: number;
  keywords: Keyword[];
};

type Lens = 'all' | 'nearMiss' | 'noClicks' | 'winning';

const LENS: Record<Lens, (k: Keyword) => boolean> = {
  all: () => true,
  // Page two: close enough that a modest improvement moves real impressions.
  nearMiss: (k) => k.position !== null && k.position > 10 && k.position <= 20,
  // Seen but not clicked — usually a title and description problem, not a
  // ranking one.
  noClicks: (k) => k.clicks === 0 && k.impressions >= 50,
  winning: (k) => k.position !== null && k.position <= 3,
};

function posTone(p: number | null) {
  if (p === null) return '';
  if (p <= 3) return 'success';
  if (p <= 10) return 'info';
  if (p <= 20) return 'warning';
  return 'danger';
}

function Rankings({ data, app }: ViewProps<Data>) {
  const [q, setQ] = useState('');
  const [lens, setLens] = useState<Lens>('all');

  const rows = data.keywords
    .filter(LENS[lens])
    .filter((k) => !q || k.keyword.toLowerCase().includes(q.toLowerCase()));

  const count = (l: Lens) => data.keywords.filter(LENS[l]).length;
  const hasVolume = data.keywords.some((k) => k.volume);

  return (
    <>
      <Header
        title={`Rankings — ${data.site.domain}`}
        subtitle={
          data.lastSyncAt
            ? `Search Console, synced ${data.lastSyncAt.slice(0, 10)}`
            : 'Search Console — never synced'
        }
        stats={[
          { label: 'Queries', value: data.total },
          { label: 'Page two', value: data.nearMiss, tone: 'warning' },
          { label: 'No clicks', value: data.noClicks, tone: 'info' },
        ]}
      />

      <Toolbar query={q} onQuery={setQ} placeholder="Filter queries…">
        <Segmented
          value={lens}
          onChange={setLens}
          options={[
            { value: 'all', label: 'All', count: data.keywords.length },
            { value: 'nearMiss', label: 'Page two', count: count('nearMiss') },
            { value: 'noClicks', label: 'No clicks', count: count('noClicks') },
            { value: 'winning', label: 'Top 3', count: count('winning') },
          ]}
        />
      </Toolbar>

      {rows.length === 0 ? (
        <p className="empty">No query matches this filter.</p>
      ) : (
        <div className="wrap">
          <table>
            <thead>
              <tr>
                <th className="static">Query</th>
                <th className="static num">Pos.</th>
                <th className="static num">Impr.</th>
                <th className="static num">Clicks</th>
                <th className="static num">CTR</th>
                {hasVolume ? <th className="static num">Volume</th> : null}
                <th className="static">Page</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.keyword}>
                  <td className="wide" title={k.keyword}>
                    {k.keyword}
                  </td>
                  <td className="num">
                    <Pill tone={posTone(k.position) as never}>{k.position ?? '—'}</Pill>
                  </td>
                  <td className="num">{k.impressions.toLocaleString('en-US')}</td>
                  <td className="num">{k.clicks.toLocaleString('en-US')}</td>
                  <td className="num">{k.ctr}%</td>
                  {hasVolume ? <td className="num">{k.volume ? k.volume.toLocaleString('en-US') : '—'}</td> : null}
                  <td className="url" title={k.url ?? ''}>
                    {k.url ? (
                      <ExternalLink app={app} href={k.url}>
                        {shortUrl(k.url)}
                      </ExternalLink>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!hasVolume ? (
        <p className="notice" style={{ marginTop: 10 }}>
          Search Console reports impressions and position, never search volume. Connect a keyword provider to add
          volume and difficulty.
        </p>
      ) : null}
    </>
  );
}

const Root = mount<Data>('seo-cursor-rankings', (p) => <Rankings {...p} />);
createRoot(document.getElementById('root')!).render(<Root />);
