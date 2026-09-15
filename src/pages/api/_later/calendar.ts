import type { APIRoute } from 'astro';
import { db } from '../../lib/db';
import { zCreateCalendarItem, zMoveCalendarItem, zGenerateWeek, parseBody, ok, fail } from '../../lib/schemas';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zCreateCalendarItem);
  if (parsed.res) return parsed.res;
  const { siteId, ...rest } = parsed.data;

  const site = await db.site.findUnique({ where: { id: siteId } });
  if (!site) return fail('Unknown website', 404);

  const item = await db.calendarItem.create({ data: { siteId, ...rest } });
  return ok(item, 201);
};

export const PATCH: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zMoveCalendarItem);
  if (parsed.res) return parsed.res;
  const { id, ...rest } = parsed.data;

  const existing = await db.calendarItem.findUnique({ where: { id } });
  if (!existing) return fail('Calendar item not found', 404);

  const item = await db.calendarItem.update({ where: { id }, data: rest });
  return ok(item);
};
