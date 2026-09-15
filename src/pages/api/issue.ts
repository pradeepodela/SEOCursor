import type { APIRoute } from 'astro';
import { db } from '../../lib/db';
import { zResolveIssue, parseBody, ok, fail } from '../../lib/schemas';

export const prerender = false;

export const PATCH: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zResolveIssue);
  if (parsed.res) return parsed.res;
  const { id, resolved } = parsed.data;

  const issue = await db.auditIssue.findUnique({ where: { id } });
  if (!issue) return fail('Issue not found', 404);

  const updated = await db.auditIssue.update({ where: { id }, data: { resolved } });

  // Keep the headline count on the site row honest.
  const open = await db.auditIssue.count({ where: { siteId: issue.siteId, resolved: false } });
  await db.site.update({ where: { id: issue.siteId }, data: { issueCount: open } });

  return ok({ issue: updated, openIssues: open });
};
