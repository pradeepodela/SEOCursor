/**
 * Shared shell for every MCP App view.
 *
 * The workspace's own islands cannot be reused here. They are handed
 * server-rendered props by Astro and mutate through `fetch('/api/...')`, and
 * inside an app iframe there is no Astro origin to fetch from, the default CSP
 * is `default-src 'none'`, and the data arrives as a tool result rather than a
 * prop. So these views are thin: they take the `structuredContent` the tool
 * already returned and render it, and any mutation goes back out as a tool
 * call the host brokers.
 *
 * Colour comes entirely from the host's own design tokens, so a view looks
 * native in light and dark without shipping a second palette that drifts.
 */

import { useState } from 'react';
import { useApp, useHostStyles, type App } from '@modelcontextprotocol/ext-apps/react-with-deps';

/** Shape every view's tool returns: the `structuredContent` block. */
export type Structured = Record<string, unknown>;

export type ViewProps<T> = {
  data: T;
  app: App;
  /** Call another tool on this server and get its structured result back. */
  call: <R = Structured>(name: string, args?: Record<string, unknown>) => Promise<R | null>;
};

/**
 * Connect to the host, wait for the tool result, then hand it to `render`.
 *
 * `ontoolresult` is the only way the result arrives. Registering it in
 * `onAppCreated` — before `connect()` sends `ui/notifications/initialized` —
 * is what makes that safe: the handler is in place before the host has been
 * told the view is ready to receive anything.
 */
export function mount<T>(appName: string, render: (props: ViewProps<T>) => React.ReactNode) {
  return function Root() {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);

    const { app, isConnected } = useApp({
      appInfo: { name: appName, version: '0.1.0' },
      capabilities: {},
      onAppCreated: (a) => {
        a.ontoolresult = (r) => {
          const structured = (r as { structuredContent?: T }).structuredContent;
          if (structured) setData(structured);
        };
      },
    });

    // Apply the host's palette, theme and fonts to this document.
    useHostStyles(app);

    const call = async <R,>(name: string, args: Record<string, unknown> = {}): Promise<R | null> => {
      if (!app) return null;
      try {
        const r = await app.callServerTool({ name, arguments: args });
        return ((r as { structuredContent?: R }).structuredContent ?? null) as R | null;
      } catch (e) {
        setError((e as Error).message);
        return null;
      }
    };

    if (error) return <Notice tone="danger">{error}</Notice>;
    if (!app || !isConnected) return <Notice>Connecting…</Notice>;
    if (!data) return <Notice>Waiting for data…</Notice>;

    return (
      <>
        {render({ data, app, call })}
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </>
    );
  };
}

// ---------------------------------------------------------------- primitives

export function Notice({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'danger' }) {
  return <p className={`notice ${tone}`}>{children}</p>;
}

export function Header({
  title,
  subtitle,
  stats,
}: {
  title: string;
  subtitle?: string;
  stats?: { label: string; value: string | number; tone?: Tone }[];
}) {
  return (
    <header className="head">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="sub">{subtitle}</p> : null}
      </div>
      {stats?.length ? (
        <dl className="stats">
          {stats.map((s) => (
            <div key={s.label} className={`stat ${s.tone ?? ''}`}>
              <dt>{s.label}</dt>
              <dd>{typeof s.value === 'number' ? s.value.toLocaleString('en-US') : s.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </header>
  );
}

export type Tone = 'danger' | 'warning' | 'success' | 'info' | '';

export function Pill({ tone = '', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

/** A search box plus arbitrary filter controls. */
export function Toolbar({
  query,
  onQuery,
  placeholder,
  children,
}: {
  query: string;
  onQuery: (v: string) => void;
  placeholder: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="toolbar">
      <input
        className="search"
        type="search"
        value={query}
        placeholder={placeholder}
        onChange={(e) => onQuery(e.target.value)}
      />
      {children}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count === undefined ? null : <span className="count">{o.count.toLocaleString('en-US')}</span>}
        </button>
      ))}
    </div>
  );
}

/** Open an external URL through the host rather than a bare anchor. */
export function ExternalLink({ app, href, children }: { app: App; href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      title={href}
      onClick={(e) => {
        e.preventDefault();
        void app.openLink({ url: href });
      }}
    >
      {children}
    </a>
  );
}

/** Truncate a URL to its path, keeping the full value in the title attribute. */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url, 'https://x.invalid');
    return (u.pathname || '/') + (u.search || '');
  } catch {
    return url;
  }
}
