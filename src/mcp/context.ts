/**
 * Shared plumbing for the MCP surface.
 *
 * Tools call into `src/lib/*` directly rather than back through the HTTP API.
 * That is deliberate: the stdio transport runs as a bare node process with no
 * Astro server in front of it, so anything routed over `fetch('/api/...')`
 * would work in the browser and fail in Claude Desktop. Calling the library is
 * also the same code path the API routes take, so the two cannot drift.
 */

import { db } from '../lib/db';

/** Uniform shape for "what site are we talking about" across every tool. */
export type SiteRef = { id: string; domain: string; url: string; name: string };

/**
 * Resolve a site the way a person would refer to it.
 *
 * The published contract says tools take a domain, because a human asking an
 * agent about their website says "example.com", not a cuid they have never
 * seen. Internally everything is keyed by id, so accept either, plus the
 * common typed forms of a domain (with scheme, with `www.`, with a path).
 *
 * With no argument at all, fall back to the primary site — a single-site
 * workspace is the common case and making the agent name it every time is
 * friction for no safety gain.
 */
export async function resolveSite(ref?: string | null): Promise<SiteRef> {
  const sites = await db.site.findMany({
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, domain: true, url: true, name: true },
  });

  if (!sites.length) {
    throw new McpToolError(
      'No website is connected yet. Connect one in the workspace at /connect, or with the `connect_site` tool.',
    );
  }

  if (!ref || !ref.trim()) {
    if (sites.length > 1) {
      // Ambiguous by construction — guessing would silently report on the
      // wrong website, which is worse than asking.
      throw new McpToolError(
        `This workspace has ${sites.length} websites. Pass \`site\` as one of: ${sites.map((s) => s.domain).join(', ')}`,
      );
    }
    return sites[0];
  }

  const needle = normalizeRef(ref);
  const match =
    sites.find((s) => s.id === ref) ??
    sites.find((s) => normalizeRef(s.domain) === needle) ??
    sites.find((s) => normalizeRef(s.url) === needle) ??
    // Last resort: a distinctive substring, so "example" finds example.com.
    sites.find((s) => normalizeRef(s.domain).includes(needle));

  if (!match) {
    throw new McpToolError(
      `No connected website matches "${ref}". Connected: ${sites.map((s) => s.domain).join(', ')}`,
    );
  }
  return match;
}

/** Strip scheme, `www.`, path and trailing dot so typed forms compare equal. */
function normalizeRef(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

/**
 * An error whose message is meant for the agent to read and act on.
 *
 * Anything else that throws is a bug, and the wrapper below lets it surface as
 * one rather than dressing a stack trace up as advice.
 */
export class McpToolError extends Error {
  readonly isToolError = true;
  constructor(message: string) {
    super(message);
    this.name = 'McpToolError';
  }
}

/** A tool result carrying both a summary for the model and data for the UI. */
export type ToolPayload<T> = {
  /** What the model reads when there is no UI, or when it reasons about the result. */
  summary: string;
  /** What the app renders. Validated against the tool's `outputSchema`. */
  data: T;
};

/**
 * Build the MCP result.
 *
 * `structuredContent` is what an MCP App reads from `ontoolresult`; the text
 * block is what a plain client shows. Both are always present, so the same
 * tool is useful with or without a UI — a server that only works when the host
 * renders HTML is a worse server.
 */
export function result<T>({ summary, data }: ToolPayload<T>) {
  return {
    content: [{ type: 'text' as const, text: summary }],
    structuredContent: data as Record<string, unknown>,
  };
}

/** A plain text-only result, for tools with nothing structured to say. */
export function text(summary: string) {
  return { content: [{ type: 'text' as const, text: summary }] };
}

/** An error result the model can read, rather than a transport-level failure. */
export function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

/**
 * Wrap a handler so an expected failure reads as guidance and an unexpected
 * one still reaches the logs intact.
 */
export function guard<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R | ReturnType<typeof toolError>> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof McpToolError) return toolError(e.message);
      const err = e as Error;
      console.error(`[mcp] ${err?.stack ?? err?.message ?? String(e)}`);
      return toolError(`The tool failed: ${err?.message ?? 'unknown error'}`);
    }
  };
}

/** Round to one decimal without trailing `.0`, for positions and percentages. */
export const round1 = (n: number): number => Math.round(n * 10) / 10;

/** `12,345` — thousands separators make big page counts readable at a glance. */
export const num = (n: number): string => n.toLocaleString('en-US');
