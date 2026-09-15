import type { APIRoute } from 'astro';
import { db } from '../../lib/db';
import { answer } from '../../lib/assistant';
import { zAskAssistant, parseBody, ok, fail } from '../../lib/schemas';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, zAskAssistant);
  if (parsed.res) return parsed.res;
  const { siteId, message, persist } = parsed.data;

  const site = await db.site.findUnique({ where: { id: siteId } });
  if (!site) return fail('Unknown website', 404);

  const reply = await answer(siteId, message);

  if (persist) {
    await db.chatMessage.createMany({
      data: [
        { siteId, role: 'user', content: message },
        { siteId, role: 'assistant', content: reply.content, payload: reply.payload ?? undefined },
      ],
    });
  }

  return ok(reply);
};
