/**
 * Blog ideas.
 *
 * Each card leads with the evidence, because an idea without the data point
 * behind it is just a title, and the whole point of generating these from the
 * site's own crawl and Search Console data is that you can check the reasoning
 * before committing a draft to it.
 */

import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { mount, Header, Pill, Toolbar, ExternalLink, type ViewProps } from './shell';
import './app.css';

type Evidence = { source?: string; finding?: string };

type Idea = {
  id: string;
  title: string;
  angle: string | null;
  targetQuery: string | null;
  rationale: string;
  evidence: Evidence[] | unknown;
  source: string;
  score: number;
  status: string;
  impressions: number | null;
  clicks: number | null;
  position: number | null;
  createdBy: string;
  draft: { id: string; status: string; url: string | null } | null;
};

type Data = {
  site: { domain: string };
  total: number;
  shown?: number;
  ideas: Idea[];
};

function scoreTone(n: number) {
  if (n >= 75) return 'success';
  if (n >= 50) return 'info';
  return '';
}

function Ideas({ data, app, call }: ViewProps<Data>) {
  const [rows, setRows] = useState(data.ideas);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const shown = rows.filter(
    (i) => !q || `${i.title} ${i.targetQuery ?? ''} ${i.rationale}`.toLowerCase().includes(q.toLowerCase()),
  );

  const write = async (idea: Idea) => {
    setBusy(idea.id);
    setNote(`Writing “${idea.title}” — an outline pass and then the draft, so this takes a minute or two.`);
    const r = await call<{ id: string; title: string; wordCount: number; seoScore: number; needsChecking: unknown[] }>(
      'generate_blog',
      { ideaId: idea.id },
    );
    if (r) {
      setRows((prev) =>
        prev.map((x) =>
          x.id === idea.id ? { ...x, status: 'DRAFTED', draft: { id: r.id, status: 'DRAFT', url: null } } : x,
        ),
      );
      const flagged = Array.isArray(r.needsChecking) ? r.needsChecking.length : 0;
      setNote(
        `Wrote “${r.title}” — ${r.wordCount.toLocaleString('en-US')} words, SEO score ${r.seoScore}/100.` +
          (flagged
            ? ` ${flagged} claim${flagged === 1 ? '' : 's'} could not be supported by the site's own data and need checking before publishing.`
            : ''),
      );
    }
    setBusy(null);
  };

  const dismiss = async (idea: Idea) => {
    setBusy(idea.id);
    const r = await call<{ status: string }>('dismiss_idea', { ideaId: idea.id });
    if (r) setRows((prev) => prev.filter((x) => x.id !== idea.id));
    setBusy(null);
  };

  return (
    <>
      <Header
        title={`Ideas — ${data.site.domain}`}
        subtitle={`${rows.length.toLocaleString('en-US')} of ${data.total.toLocaleString('en-US')}`}
        stats={[{ label: 'Ideas', value: data.total }]}
      />

      <Toolbar query={q} onQuery={setQ} placeholder="Filter ideas…" />

      {note ? <p className="notice">{note}</p> : null}

      {shown.length === 0 ? (
        <p className="empty">{rows.length === 0 ? 'No ideas yet.' : `No idea matches “${q}”.`}</p>
      ) : (
        <div className="cards" style={{ marginTop: note ? 10 : 0 }}>
          {shown.map((idea) => {
            const evidence = Array.isArray(idea.evidence) ? (idea.evidence as Evidence[]) : [];
            return (
              <article key={idea.id} className="card">
                <div className="row">
                  <Pill tone={scoreTone(idea.score) as never}>Score {idea.score}</Pill>
                  <Pill>{idea.source}</Pill>
                  {idea.status !== 'SUGGESTED' ? <Pill tone="info">{idea.status}</Pill> : null}
                  {idea.targetQuery ? <Pill tone="info">“{idea.targetQuery}”</Pill> : null}
                </div>

                <h2>{idea.title}</h2>
                {idea.angle ? <p>{idea.angle}</p> : null}
                <p className="fix">{idea.rationale}</p>

                {/* The measured numbers, when the idea came from a real query. */}
                {idea.impressions !== null || idea.position !== null ? (
                  <p>
                    {idea.impressions !== null ? `${idea.impressions.toLocaleString('en-US')} impressions` : null}
                    {idea.clicks !== null ? `, ${idea.clicks.toLocaleString('en-US')} clicks` : null}
                    {idea.position !== null ? `, average position ${idea.position}` : null}
                  </p>
                ) : null}

                {evidence.length ? (
                  <ul>
                    {evidence.slice(0, 3).map((e, n) => (
                      <li key={n}>
                        {e.source ? <strong>{e.source}: </strong> : null}
                        {e.finding}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="actions">
                  {idea.draft?.url ? (
                    <ExternalLink app={app} href={idea.draft.url}>
                      View published post
                    </ExternalLink>
                  ) : (
                    <button
                      className="act primary"
                      type="button"
                      disabled={busy !== null || idea.status === 'DRAFTED'}
                      onClick={() => void write(idea)}
                    >
                      {busy === idea.id ? 'Writing…' : idea.status === 'DRAFTED' ? 'Drafted' : 'Write this post'}
                    </button>
                  )}
                  <button className="act" type="button" disabled={busy !== null} onClick={() => void dismiss(idea)}>
                    Dismiss
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

const Root = mount<Data>('seo-cursor-ideas', (p) => <Ideas {...p} />);
createRoot(document.getElementById('root')!).render(<Root />);
