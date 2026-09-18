import { db } from './db';

/**
 * WordPress publishing over the REST API.
 *
 * Authentication uses an application password, which WordPress issues per
 * application and which can be revoked without touching the account password.
 */

export type WpVerify = {
  ok: boolean;
  error?: string;
  siteName?: string;
  wpVersion?: string;
  canPublish?: boolean;
  user?: string;
  categories?: { id: number; name: string; count: number }[];
};

const auth = (username: string, appPassword: string) =>
  'Basic ' + Buffer.from(`${username}:${appPassword.replace(/\s+/g, '')}`).toString('base64');

/**
 * People paste whatever is in the address bar, which is usually a wp-admin
 * page. Those URLs return the admin HTML with a 200, so an unnormalised base
 * looks like it verifies and then cannot publish. Reduce to the site root.
 */
export function normalizeBaseUrl(input: string): string {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    return input.trim().replace(/\/+$/, '');
  }

  u.search = '';
  u.hash = '';
  u.pathname = u.pathname
    .replace(/\/wp-admin(\/.*)?$/i, '')
    .replace(/\/wp-login\.php$/i, '')
    .replace(/\/wp-json(\/.*)?$/i, '')
    .replace(/\/index\.php$/i, '')
    .replace(/\/+$/, '');

  return u.toString().replace(/\/+$/, '');
}

const api = (baseUrl: string, path: string) =>
  `${normalizeBaseUrl(baseUrl)}/wp-json${path}`;

async function wpFetch(baseUrl: string, path: string, init: RequestInit & { username?: string; appPassword?: string } = {}) {
  const { username, appPassword, ...rest } = init;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
    ...(rest.headers as Record<string, string> ?? {}),
  };
  if (username && appPassword) headers.authorization = auth(username, appPassword);

  const res = await fetch(api(baseUrl, path), { ...rest, headers, signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* WordPress sometimes emits PHP notices before the JSON */ }

  if (!res.ok) {
    const msg = json?.message ?? `WordPress returned ${res.status}`;
    throw new Error(stripTags(msg));
  }

  // A 200 carrying HTML means we reached a page, not the REST API — the usual
  // cause is a wrong base URL, or the REST API being disabled by a plugin.
  if (json === null) {
    throw new Error(
      `${api(baseUrl, path)} returned a page instead of JSON. Check the site address is the WordPress home URL, and that the REST API is not disabled.`,
    );
  }

  return json;
}

/**
 * WordPress cannot tell us why Basic auth failed.
 *
 * When an application password does not validate, core returns null rather
 * than an error, so the request simply falls through to "not logged in" — the
 * same response you get with no credentials at all, or with the Authorization
 * header stripped by the server. Verified against wordpress.org and ma.tt,
 * which answer identically to a deliberately bogus login. So do not guess a
 * cause: give both, likeliest first.
 */
function authFailureHelp(baseUrl: string, appPassword: string): string {
  const compact = appPassword.replace(/\s+/g, '');
  const folder = new URL(baseUrl).pathname.replace(/\/+$/, '');

  const lines = ['WordPress rejected the credentials. It does not say why, so there are two likely causes.'];

  lines.push(
    compact.length === 24
      ? '\n1. The application password is wrong or was revoked. Generate a fresh one under Users → Profile → Application Passwords.'
      : `\n1. That is probably not an application password — those are 24 characters and yours is ${compact.length}. ` +
        'Generate one under Users → Profile → Application Passwords and use that instead of your account password.',
  );

  lines.push(
    '\n2. Your server is dropping the Authorization header before WordPress sees it, which happens on some Apache hosts. ' +
      `Add this to the .htaccess next to wp-config.php${folder ? ` (in the ${folder} folder, not the domain root)` : ''}, above # BEGIN WordPress:\n` +
      'RewriteEngine On\n' +
      'RewriteCond %{HTTP:Authorization} ^(.*)\n' +
      'RewriteRule .* - [e=HTTP_AUTHORIZATION:%1]\n' +
      'If that changes nothing and PHP runs as CGI/FastCGI, use CGIPassAuth On instead.',
  );

  return lines.join('\n');
}

/** Confirm the credentials work and the user may actually publish. */
export async function verifyConnection(baseUrl: string, username: string, appPassword: string): Promise<WpVerify> {
  try {
    const root = await wpFetch(baseUrl, '/');
    const me = await wpFetch(baseUrl, '/wp/v2/users/me?context=edit', { username, appPassword })
      .catch((e: Error) => {
        if (/not currently logged in/i.test(e.message)) throw new Error(authFailureHelp(baseUrl, appPassword));
        throw e;
      });

    let categories: WpVerify['categories'] = [];
    try {
      const cats = await wpFetch(baseUrl, '/wp/v2/categories?per_page=50&orderby=count&order=desc', { username, appPassword });
      categories = (cats ?? []).map((c: any) => ({ id: c.id, name: decodeEntities(String(c.name ?? '')), count: c.count }));
    } catch { /* categories are optional */ }

    if (!me?.id) throw new Error('Signed in, but WordPress did not return a user — check the username and application password.');

    const caps: Record<string, boolean> = me?.capabilities ?? {};
    return {
      ok: true,
      siteName: root?.name,
      wpVersion: root?.gmt_offset !== undefined ? undefined : undefined,
      user: me?.name ?? username,
      canPublish: caps.publish_posts !== false,
      categories,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------------------------------------------------------------- taxonomy

export type WpTerm = { id: number; name: string; slug: string; count: number };
export type TermKind = 'categories' | 'tags';

/**
 * Every term of one kind on the connected site.
 *
 * Paged deliberately rather than taking the first hundred: a site with two
 * hundred tags would otherwise show a truncated list that looks complete, and
 * a person picking from it would never know the tag they wanted was missing.
 * The cap exists only so a pathological site cannot hang the request.
 */
export async function listTerms(siteId: string, kind: TermKind): Promise<WpTerm[]> {
  const conn = await db.wordPressConnection.findUnique({ where: { siteId } });
  if (!conn) throw new Error('WordPress is not connected for this website');

  const out: WpTerm[] = [];
  for (let page = 1; page <= 10; page++) {
    const rows = await wpFetch(
      conn.baseUrl,
      `/wp/v2/${kind}?per_page=100&page=${page}&orderby=count&order=desc`,
      { username: conn.username, appPassword: conn.appPassword },
    );
    if (!Array.isArray(rows) || !rows.length) break;
    out.push(...rows.map((t: any) => ({ id: t.id, name: decodeEntities(String(t.name ?? '')), slug: t.slug, count: t.count ?? 0 })));
    if (rows.length < 100) break;
  }
  return out;
}

/**
 * WordPress returns term names HTML-encoded.
 *
 * A category displayed in wp-admin as "Membership & Retention" comes back from
 * the REST API as "Membership &amp; Retention", and an apostrophe comes back as
 * &#8217;. Comparing the raw strings means a person picking that category never
 * matches it, and the post publishes with no category at all and no error — so
 * decode before anything is shown or compared.
 */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // Ampersand last: decoding it first would turn "&amp;lt;" into a tag.
    .replace(/&amp;/g, '&');
}

/** Compare on what a person would type, not on the wire format. */
const sameName = (a: string, b: string) =>
  decodeEntities(a).trim().toLowerCase() === decodeEntities(b).trim().toLowerCase();

export type ResolvedTerms = {
  ids: number[];
  /** Names that matched nothing and were not created. */
  missing: string[];
  /** Names newly created on the site. */
  created: string[];
};

/**
 * Turn term names into the IDs the REST API requires.
 *
 * The two taxonomies get different treatment on purpose, following what
 * WordPress itself does. Tags are free-form, so a name that does not exist is
 * created. Categories are a deliberate structure that someone designed, and
 * inventing one because a model suggested it would quietly reshape the site's
 * navigation — so an unmatched category is reported back, not created, unless
 * the caller explicitly asks.
 */
export async function resolveTerms(
  siteId: string,
  kind: TermKind,
  names: string[],
  opts: { create?: boolean } = {},
): Promise<ResolvedTerms> {
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (!wanted.length) return { ids: [], missing: [], created: [] };

  const conn = await db.wordPressConnection.findUnique({ where: { siteId } });
  if (!conn) throw new Error('WordPress is not connected for this website');

  const create = opts.create ?? kind === 'tags';
  const existing = await listTerms(siteId, kind);

  const ids: number[] = [];
  const missing: string[] = [];
  const created: string[] = [];

  for (const name of wanted) {
    const hit = existing.find((t) => sameName(t.name, name) || sameName(t.slug, name));
    if (hit) {
      ids.push(hit.id);
      continue;
    }
    if (!create) {
      missing.push(name);
      continue;
    }

    try {
      const made = await wpFetch(conn.baseUrl, `/wp/v2/${kind}`, {
        method: 'POST',
        body: JSON.stringify({ name }),
        username: conn.username,
        appPassword: conn.appPassword,
      });
      ids.push(made.id);
      created.push(name);
    } catch (e) {
      // A race, or a term the account may not create. Losing one tag is not a
      // reason to fail a publish that is otherwise ready.
      const msg = (e as Error).message;
      const dup = /term_exists/i.test(msg) ? null : msg;
      if (dup) missing.push(name);
    }
  }

  return { ids, missing, created };
}

export type PublishResult = {
  id: number;
  link: string;
  status: string;
  /** What actually landed on the post, so the caller never has to assume. */
  terms: { categories: string[]; tags: string[]; missing: string[]; created: string[] };
};

/** Create or update the post for a piece of content. */
export async function publishPost(
  siteId: string,
  content: {
    id: string; title: string; body: string; excerpt: string | null; slug: string; wpPostId: number | null;
    categories?: string[]; tags?: string[];
  },
  opts: { status?: 'draft' | 'publish' | 'pending'; createCategories?: boolean } = {},
): Promise<PublishResult> {
  const conn = await db.wordPressConnection.findUnique({ where: { siteId } });
  if (!conn) throw new Error('WordPress is not connected for this website');

  const status = opts.status ?? (conn.defaultStatus as 'draft' | 'publish' | 'pending');

  const cats = await resolveTerms(siteId, 'categories', content.categories ?? [], {
    create: opts.createCategories ?? false,
  });
  const tags = await resolveTerms(siteId, 'tags', content.tags ?? []);

  // The configured default is a fallback for a post that names no category of
  // its own, not an addition to one that does — otherwise every post would
  // carry "Uncategorised" alongside whatever it actually belongs to.
  const categoryIds = cats.ids.length ? cats.ids : conn.defaultCategory ? [conn.defaultCategory] : [];

  const payload: Record<string, unknown> = {
    title: content.title,
    content: markdownToHtml(content.body),
    excerpt: content.excerpt ?? '',
    slug: content.slug,
    status,
    ...(categoryIds.length ? { categories: categoryIds } : {}),
    ...(tags.ids.length ? { tags: tags.ids } : {}),
    ...(conn.defaultAuthor ? { author: conn.defaultAuthor } : {}),
  };

  const path = content.wpPostId ? `/wp/v2/posts/${content.wpPostId}` : '/wp/v2/posts';
  const res = await wpFetch(conn.baseUrl, path, {
    method: 'POST',
    body: JSON.stringify(payload),
    username: conn.username,
    appPassword: conn.appPassword,
  });

  return {
    id: res.id,
    link: res.link,
    status: res.status,
    terms: {
      categories: content.categories ?? [],
      tags: content.tags ?? [],
      // An unmatched category is the one outcome a caller must not miss: the
      // post published, but not where they meant it to go.
      missing: [...cats.missing, ...tags.missing],
      created: [...cats.created, ...tags.created],
    },
  };
}

const stripTags = (s: string) => String(s).replace(/<[^>]*>/g, '').trim();

/**
 * Markdown → HTML for the WordPress editor.
 *
 * Deliberately small: headings, lists, tables, links, emphasis and paragraphs.
 * Anything richer belongs in blocks, which is a later step.
 */
export function markdownToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) =>
    esc(s)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

  const out: string[] = [];
  const lines = md.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        const cells = lines[i].split('|').slice(1, -1).map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
        i++;
      }
      if (rows.length) {
        const [head, ...body] = rows;
        out.push(
          `<figure class="wp-block-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>` +
          body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('') +
          `</tbody></table></figure>`,
        );
      }
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote class="wp-block-quote"><p>${inline(quote.join(' '))}</p></blockquote>`);
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s/, '')); i++; }
      out.push(`<ol>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ol>`);
      continue;
    }

    if (/^[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) { items.push(lines[i].replace(/^[-*]\s/, '')); i++; }
      out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`);
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { const n = h[1].length; out.push(`<h${n}>${inline(h[2])}</h${n}>`); i++; continue; }

    if (line.trim()) {
      // Gather a paragraph across soft-wrapped lines.
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^([#>|]|[-*]\s|\d+\.\s)/.test(lines[i])) {
        para.push(lines[i].trim()); i++;
      }
      out.push(`<p>${inline(para.join(' '))}</p>`);
      continue;
    }
    i++;
  }

  return out.join('\n\n');
}
