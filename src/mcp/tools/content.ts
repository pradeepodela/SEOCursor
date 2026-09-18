/**
 * Content tools: ideas, drafting and publishing.
 *
 * Two things here cost real money or reach the public, and both say so in
 * their own description rather than relying on the host to guess:
 * `generate_blog` spends LLM credits, and `publish_blog` puts a post on a live
 * website. Publishing keeps the workspace's `confirm: true` rule — an agent
 * has to mean it, not merely pass an id.
 */

import { z } from 'zod4';
import type { McpServer } from '@modelcontextprotocol/server';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { db } from '../../lib/db';
import { generateIdeas, saveIdeas, buildContext } from '../../lib/ideas';
import { generateBlog } from '../../lib/blog';
import { publishPost, listTerms } from '../../lib/wordpress';
import { llmConfigured, modelBlocker } from '../../lib/llm';
import { resolveSite, result, guard, McpToolError, num } from '../context';

/**
 * Not every provider reports what a call cost — Groq's free tier and some
 * OpenRouter models return nothing. Printing "$0.0000" there would assert the
 * run was free, which is a different claim from "unpriced".
 */
const cost = (usd: number | null): string => (usd === null ? 'cost not reported by the provider' : `cost $${usd.toFixed(4)}`);
import { UI } from '../apps/registry';

const siteArg = z
  .string()
  .optional()
  .describe('Domain of the connected website, e.g. "example.com". Omit when only one is connected.');

function requireLlm(): void {
  if (!llmConfigured()) {
    throw new McpToolError(
      'No model key is set. Add GROQ_API_KEY or OPENROUTER_API_KEY to the workspace .env — this tool writes text and cannot run without one.',
    );
  }
}

export function registerContentTools(server: McpServer): void {
  // ------------------------------------------------------------- ideas (app)

  registerAppTool(
    server,
    'list_ideas',
    {
      title: 'Blog ideas',
      description:
        'Blog ideas for this website, each with the rationale and the measured data point behind it.',
      inputSchema: z.object({
        site: siteArg,
        status: z
          .enum(['SUGGESTED', 'SCHEDULED', 'DRAFTED', 'PUBLISHED', 'DISMISSED', 'ALL'])
          .default('SUGGESTED'),
        limit: z.number().int().min(1).max(200).default(50),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: UI.ideas } },
    },
    guard(async ({ site: ref, status, limit }) => {
      const site = await resolveSite(ref);
      const where = { siteId: site.id, ...(status === 'ALL' ? {} : { status }) };

      const [rows, total] = await Promise.all([
        db.blogIdea.findMany({
          where,
          orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
          take: limit,
          include: { content: { select: { id: true, status: true, wpUrl: true } } },
        }),
        db.blogIdea.count({ where }),
      ]);

      if (!total) {
        return result({
          summary: `No ${status === 'ALL' ? '' : `${status.toLowerCase()} `}ideas for ${site.domain} yet. Run \`generate_ideas\` to create some from the site's own crawl and Search Console data.`,
          data: { site: { domain: site.domain }, total: 0, ideas: [] },
        });
      }

      return result({
        summary:
          `${num(total)} ${status === 'ALL' ? '' : `${status.toLowerCase()} `}ideas for ${site.domain}:\n` +
          rows
            .slice(0, 12)
            .map((i) => `- "${i.title}"${i.targetQuery ? ` (targets "${i.targetQuery}")` : ''} — ${i.rationale}`)
            .join('\n') +
          (rows.length > 12 ? `\n…and ${num(rows.length - 12)} more.` : ''),
        data: {
          site: { domain: site.domain },
          total,
          shown: rows.length,
          ideas: rows.map((i) => ({
            id: i.id,
            title: i.title,
            angle: i.angle,
            targetQuery: i.targetQuery,
            rationale: i.rationale,
            evidence: i.evidence,
            source: i.source,
            score: i.score,
            status: i.status,
            impressions: i.impressions,
            clicks: i.clicks,
            position: i.position,
            createdBy: i.createdBy,
            draft: i.content ? { id: i.content.id, status: i.content.status, url: i.content.wpUrl } : null,
          })),
        },
      });
    }),
  );

  // ------------------------------------------------------------- generate ideas

  server.registerTool(
    'generate_ideas',
    {
      title: 'Generate blog ideas',
      description:
        "Generate blog titles from this website's own data. Every suggestion is tied to a crawled page, a page-two query, a query earning impressions but no clicks, or a thin page — the model is never asked what to write about in the abstract. Spends LLM credits.",
      inputSchema: z.object({
        site: siteArg,
        count: z.number().int().min(1).max(25).default(10),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    guard(async ({ site: ref, count }) => {
      requireLlm();
      const ptr = await resolveSite(ref);
      const site = await db.site.findUniqueOrThrow({ where: { id: ptr.id } });
      if (!site.lastCrawlAt) {
        throw new McpToolError(`${site.domain} has not been crawled yet — there is nothing to analyse. Run \`crawl_site\` first.`);
      }

      const blocked = modelBlocker(site.ideaModel, 'title model');
      if (blocked) throw new McpToolError(blocked);

      const ctx = await buildContext(site.id);
      const { ideas, usage, model } = await generateIdeas(site.id, count);
      const saved = await saveIdeas(site.id, ideas, ctx);

      return result({
        summary:
          `Generated ${num(ideas.length)} ideas for ${site.domain}, saved ${num(saved)} (${num(ideas.length - saved)} were duplicates of existing titles). ` +
          `Model ${model}, ${cost(usage.costUsd)}. ` +
          `Grounded in ${num(ctx.pages.length)} crawled pages, ${num(ctx.nearMiss.length)} page-two queries and ${num(ctx.noClicks.length)} queries with impressions but no clicks.` +
          (ctx.hasGsc
            ? ''
            : ' Search Console is not connected, so demand for these topics is unverified — this reflects what the site covers, not what people search for.'),
        data: {
          site: { domain: site.domain },
          proposed: ideas.length,
          saved,
          duplicatesSkipped: ideas.length - saved,
          model,
          costUsd: usage.costUsd,
          groundedIn: {
            pages: ctx.pages.length,
            nearMissQueries: ctx.nearMiss.length,
            noClickQueries: ctx.noClicks.length,
            researchedKeywords: ctx.research.length,
            hasSearchConsole: ctx.hasGsc,
          },
        },
      });
    }),
  );

  server.registerTool(
    'add_idea',
    {
      title: 'Add a blog idea',
      description: 'Add a blog title to the list by hand.',
      inputSchema: z.object({
        site: siteArg,
        title: z.string().min(5).max(180),
        targetQuery: z.string().max(160).optional(),
        angle: z.string().max(400).optional().describe('What makes this different from what already ranks.'),
        rationale: z.string().max(800).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    guard(async ({ site: ref, title, targetQuery, angle, rationale }) => {
      const site = await resolveSite(ref);
      const clash = await db.blogIdea.findFirst({
        where: { siteId: site.id, title: { equals: title, mode: 'insensitive' } },
      });
      if (clash) throw new McpToolError(`"${title}" is already on the list for ${site.domain}.`);

      const idea = await db.blogIdea.create({
        data: {
          siteId: site.id,
          title,
          targetQuery: targetQuery || null,
          angle: angle || null,
          rationale: rationale || 'Added via MCP.',
          source: 'MANUAL',
          createdBy: 'agent',
          score: 50,
        },
      });
      return result({
        summary: `Added "${title}" to ${site.domain}. Idea id ${idea.id} — pass it to \`generate_blog\` to write the post.`,
        data: { id: idea.id, title: idea.title, status: idea.status },
      });
    }),
  );

  server.registerTool(
    'dismiss_idea',
    {
      title: 'Dismiss a blog idea',
      description: 'Dismiss an idea so the generator stops re-suggesting it. The row is kept, not deleted.',
      inputSchema: z.object({ ideaId: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    guard(async ({ ideaId }) => {
      const idea = await db.blogIdea.findUnique({ where: { id: ideaId } });
      if (!idea) throw new McpToolError(`No idea with id "${ideaId}".`);
      await db.blogIdea.update({ where: { id: ideaId }, data: { status: 'DISMISSED' } });
      return result({ summary: `Dismissed "${idea.title}".`, data: { id: ideaId, status: 'DISMISSED' } });
    }),
  );

  // ------------------------------------------------------------- write

  server.registerTool(
    'generate_blog',
    {
      title: 'Write a blog post',
      description:
        'Write the post for one idea: an outline pass grounded in the real page list, then the draft. Returns the draft with any claims it could not support flagged for review. Spends LLM credits and can take a minute or two.',
      inputSchema: z.object({
        ideaId: z.string().describe('Idea id, from `list_ideas`.'),
        site: siteArg,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    guard(async ({ ideaId, site: ref }) => {
      requireLlm();
      const ptr = await resolveSite(ref);
      const idea = await db.blogIdea.findFirst({ where: { id: ideaId, siteId: ptr.id } });
      if (!idea) throw new McpToolError(`No idea with id "${ideaId}" on ${ptr.domain}.`);

      const site = await db.site.findUniqueOrThrow({ where: { id: ptr.id }, select: { draftModel: true } });
      const blocked = modelBlocker(site.draftModel, 'writing model');
      if (blocked) throw new McpToolError(blocked);

      const { piece, outline, usage, model, suspicions, grade } = await generateBlog(ptr.id, ideaId);

      return result({
        summary:
          `Wrote "${piece.title}" — ${num(piece.wordCount)} words across ${num(outline.sections.length)} sections, ` +
          `${num(outline.internalLinks.length)} internal links, SEO score ${piece.seoScore}/100. ` +
          `Model ${model}, ${cost(usage.costUsd)}. Draft id ${piece.id}.\n` +
          (piece.categories.length || piece.tags.length
            ? `Suggested category ${piece.categories.join(', ') || '(none)'} and tags ${piece.tags.join(', ') || '(none)'} — these are the writer's proposal, not a person's choice. Adjust with \`set_draft_terms\` before publishing.\n`
            : '') +
          (suspicions.length
            ? `${num(suspicions.length)} claim${suspicions.length === 1 ? '' : 's'} could not be supported by the site's own data and need checking before this is published:\n` +
              suspicions.map((s) => `- [${s.kind}] "${s.quote}"`).join('\n')
            : 'No unsupported claims were flagged.'),
        data: {
          id: piece.id,
          title: piece.title,
          slug: piece.slug,
          status: piece.status,
          wordCount: piece.wordCount,
          seoScore: piece.seoScore,
          excerpt: piece.excerpt,
          sections: outline.sections.length,
          internalLinks: outline.internalLinks.length,
          model,
          costUsd: usage.costUsd,
          needsChecking: suspicions,
          checks: grade.checks,
          categories: piece.categories,
          tags: piece.tags,
          termsFromModel: piece.termsFromModel,
          body: piece.body,
        },
      });
    }),
  );

  server.registerTool(
    'list_drafts',
    {
      title: 'Drafts',
      description: 'Content pieces written for this website, drafted or published.',
      inputSchema: z.object({
        site: siteArg,
        status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'UPDATE', 'ALL']).default('ALL'),
        limit: z.number().int().min(1).max(100).default(25),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(async ({ site: ref, status, limit }) => {
      const site = await resolveSite(ref);
      const rows = await db.contentPiece.findMany({
        where: { siteId: site.id, ...(status === 'ALL' ? {} : { status }) },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });
      if (!rows.length) throw new McpToolError(`No ${status === 'ALL' ? '' : `${status.toLowerCase()} `}drafts for ${site.domain}.`);

      return result({
        summary: rows
          .map(
            (p) =>
              `- "${p.title}" (${p.status}, ${num(p.wordCount)} words, SEO ${p.seoScore}/100) — id ${p.id}` +
              (p.wpUrl ? ` — live at ${p.wpUrl}` : ''),
          )
          .join('\n'),
        data: {
          site: { domain: site.domain },
          total: rows.length,
          drafts: rows.map((p) => ({
            id: p.id,
            title: p.title,
            slug: p.slug,
            status: p.status,
            wordCount: p.wordCount,
            seoScore: p.seoScore,
            excerpt: p.excerpt,
            model: p.model,
            costUsd: p.costUsd,
            wpUrl: p.wpUrl,
            publishError: p.publishError,
            categories: p.categories,
            tags: p.tags,
            termsFromModel: p.termsFromModel,
            updatedAt: p.updatedAt.toISOString(),
          })),
        },
      });
    }),
  );

  server.registerTool(
    'get_draft',
    {
      title: 'Read a draft',
      description: 'The full body of one draft, as markdown.',
      inputSchema: z.object({ draftId: z.string() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(async ({ draftId }) => {
      const piece = await db.contentPiece.findUnique({ where: { id: draftId } });
      if (!piece) throw new McpToolError(`No draft with id "${draftId}".`);
      return result({
        summary: `# ${piece.title}\n\n${piece.body}`,
        data: {
          id: piece.id,
          title: piece.title,
          slug: piece.slug,
          status: piece.status,
          body: piece.body,
          excerpt: piece.excerpt,
          wordCount: piece.wordCount,
          seoScore: piece.seoScore,
          wpUrl: piece.wpUrl,
          categories: piece.categories,
          tags: piece.tags,
          termsFromModel: piece.termsFromModel,
        },
      });
    }),
  );

  // ------------------------------------------------------------- taxonomy

  server.registerTool(
    'list_wp_terms',
    {
      title: 'WordPress categories and tags',
      description:
        'Every category and tag on the connected WordPress site, with how many posts use each. Read this before setting terms on a draft — a category that does not exist here cannot be applied.',
      inputSchema: z.object({
        site: siteArg,
        kind: z.enum(['categories', 'tags', 'both']).default('both'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    guard(async ({ site: ref, kind }) => {
      const site = await resolveSite(ref);
      const wp = await db.wordPressConnection.findUnique({ where: { siteId: site.id } });
      if (!wp) throw new McpToolError(`WordPress is not connected for ${site.domain}, so there is no taxonomy to read.`);

      const [categories, tags] = await Promise.all([
        kind === 'tags' ? Promise.resolve([]) : listTerms(site.id, 'categories'),
        kind === 'categories' ? Promise.resolve([]) : listTerms(site.id, 'tags'),
      ]);

      const render = (label: string, rows: { name: string; count: number }[]) =>
        rows.length
          ? `${label} (${num(rows.length)}): ${rows.slice(0, 40).map((t) => `${t.name}${t.count ? ` [${num(t.count)}]` : ''}`).join(', ')}` +
            (rows.length > 40 ? ` …and ${num(rows.length - 40)} more` : '')
          : `${label}: none`;

      return result({
        summary: [
          kind === 'tags' ? '' : render('Categories', categories),
          kind === 'categories' ? '' : render('Tags', tags),
        ].filter(Boolean).join('\n'),
        data: {
          site: { domain: site.domain },
          categories: categories.map((t) => ({ id: t.id, name: t.name, slug: t.slug, count: t.count })),
          tags: tags.map((t) => ({ id: t.id, name: t.name, slug: t.slug, count: t.count })),
        },
      });
    }),
  );

  server.registerTool(
    'set_draft_terms',
    {
      title: 'Set a draft\'s category and tags',
      description:
        'Set the WordPress categories and tags stored on a draft. Nothing is sent to WordPress until the draft is published. Categories must already exist on the site; tags are created on publish if they do not.',
      inputSchema: z.object({
        draftId: z.string().describe('Draft id, from `list_drafts`.'),
        categories: z
          .array(z.string().min(1).max(80))
          .max(10)
          .optional()
          .describe('Category names, exactly as they appear in `list_wp_terms`. Pass [] to clear.'),
        tags: z.array(z.string().min(1).max(80)).max(20).optional().describe('Tag names. Pass [] to clear.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    guard(async ({ draftId, categories, tags }) => {
      const piece = await db.contentPiece.findUnique({ where: { id: draftId } });
      if (!piece) throw new McpToolError(`No draft with id "${draftId}".`);
      if (categories === undefined && tags === undefined) {
        throw new McpToolError('Pass categories, tags, or both — there is nothing to set otherwise.');
      }

      // Warn about a category that will not apply, rather than storing it and
      // letting the publish quietly drop it.
      let unknown: string[] = [];
      if (categories?.length) {
        const existing = await listTerms(piece.siteId, 'categories').catch(() => []);
        if (existing.length) {
          unknown = categories.filter(
            (c) => !existing.some((t) => t.name.trim().toLowerCase() === c.trim().toLowerCase()),
          );
        }
      }

      const updated = await db.contentPiece.update({
        where: { id: draftId },
        data: {
          ...(categories === undefined ? {} : { categories }),
          ...(tags === undefined ? {} : { tags }),
          termsFromModel: false,
        },
      });

      return result({
        summary:
          `"${updated.title}" — category ${updated.categories.length ? updated.categories.join(', ') : '(none)'}; ` +
          `tags ${updated.tags.length ? updated.tags.join(', ') : '(none)'}.` +
          (unknown.length
            ? ` Warning: ${unknown.join(', ')} ${unknown.length === 1 ? 'does' : 'do'} not exist on the site, so publishing will not apply ${unknown.length === 1 ? 'it' : 'them'} unless you create ${unknown.length === 1 ? 'it' : 'them'} in WordPress first.`
            : ''),
        data: {
          id: updated.id,
          title: updated.title,
          categories: updated.categories,
          tags: updated.tags,
          unknownCategories: unknown,
        },
      });
    }),
  );

  // ------------------------------------------------------------- publish

  server.registerTool(
    'publish_blog',
    {
      title: 'Publish to WordPress',
      description:
        'Publish a draft to the connected WordPress site. This is outward-facing and takes an explicit confirm. Use status "draft" to push it to WordPress without making it public.',
      inputSchema: z.object({
        draftId: z.string().describe('Draft id, from `list_drafts`.'),
        status: z
          .enum(['draft', 'publish', 'pending'])
          .default('draft')
          .describe('"publish" makes it live and publicly visible.'),
        confirm: z
          .literal(true)
          .describe('Must be true. Publishing reaches the public internet, so the caller has to mean it.'),
        categories: z
          .array(z.string().min(1).max(80))
          .max(10)
          .optional()
          .describe("Overrides the draft's stored categories. Omit to publish with what the draft already carries."),
        tags: z.array(z.string().min(1).max(80)).max(20).optional().describe("Overrides the draft's stored tags."),
        createCategories: z
          .boolean()
          .default(false)
          .describe(
            'Create any category that does not exist. Off by default: a category is a structure someone designed, and inventing one reshapes the site navigation as a side effect of publishing.',
          ),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    guard(async ({ draftId, status, categories, tags, createCategories }) => {
      const piece = await db.contentPiece.findUnique({ where: { id: draftId } });
      if (!piece) throw new McpToolError(`No draft with id "${draftId}".`);
      if (!piece.body.trim()) throw new McpToolError('That draft has no body — generate it first.');

      const wp = await db.wordPressConnection.findUnique({ where: { siteId: piece.siteId } });
      if (!wp) throw new McpToolError('WordPress is not connected for this website. Connect it in the workspace under Settings.');

      try {
        const useCategories = categories ?? piece.categories;
        const useTags = tags ?? piece.tags;

        const published = await publishPost(
          piece.siteId,
          {
            id: piece.id,
            title: piece.title,
            body: piece.body,
            excerpt: piece.excerpt,
            slug: piece.slug,
            wpPostId: piece.wpPostId,
            categories: useCategories,
            tags: useTags,
          },
          { status, createCategories },
        );

        await db.contentPiece.update({
          where: { id: draftId },
          data: {
            status: status === 'publish' ? 'PUBLISHED' : 'DRAFT',
            publishedAt: status === 'publish' ? new Date() : null,
            wpPostId: published.id,
            wpUrl: published.link,
            wpStatus: published.status,
            publishError: null,
            categories: useCategories,
            tags: useTags,
            ...(categories || tags ? { termsFromModel: false } : {}),
          },
        });

        if (piece.blogIdeaId && status === 'publish') {
          await db.blogIdea.update({ where: { id: piece.blogIdeaId }, data: { status: 'PUBLISHED' } });
          await db.calendarItem.updateMany({ where: { blogIdeaId: piece.blogIdeaId }, data: { status: 'DONE' } });
        }

        const t = published.terms;
        return result({
          summary:
            (status === 'publish'
              ? `Published "${piece.title}" — it is now live at ${published.link}.`
              : `Pushed "${piece.title}" to WordPress as a ${published.status}. It is not publicly visible: ${published.link}`) +
            (useCategories.length ? ` Category: ${useCategories.join(', ')}.` : '') +
            (useTags.length ? ` Tags: ${useTags.join(', ')}.` : '') +
            (t.created.length ? ` Created ${t.created.length} new tag${t.created.length === 1 ? '' : 's'}: ${t.created.join(', ')}.` : '') +
            // The post is live either way, so this is a correction to make, not
            // a failure — but it must not pass silently.
            (t.missing.length
              ? ` NOT APPLIED: ${t.missing.join(', ')} — ${t.missing.length === 1 ? 'that term does' : 'those terms do'} not exist on the site. Create ${t.missing.length === 1 ? 'it' : 'them'} in WordPress, or re-publish with createCategories: true.`
              : ''),
          data: {
            draftId,
            wpPostId: published.id,
            url: published.link,
            status: published.status,
            terms: t,
          },
        });
      } catch (e) {
        const error = (e as Error).message;
        await db.contentPiece.update({ where: { id: draftId }, data: { publishError: error } }).catch(() => {});
        throw new McpToolError(`WordPress rejected the post: ${error}`);
      }
    }),
  );
}
