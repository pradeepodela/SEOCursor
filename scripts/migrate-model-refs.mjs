/** Move stored model ids to the "provider:model" form. Unprefixed meant OpenRouter. */
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const KNOWN = ['openrouter:', 'groq:'];
const prefix = (v) => (KNOWN.some((k) => v.startsWith(k)) ? v : `openrouter:${v}`);

const sites = await db.site.findMany({ select: { id: true, domain: true, ideaModel: true, draftModel: true } });
let changed = 0;
for (const s of sites) {
  const ideaModel = prefix(s.ideaModel);
  const draftModel = prefix(s.draftModel);
  if (ideaModel !== s.ideaModel || draftModel !== s.draftModel) {
    await db.site.update({ where: { id: s.id }, data: { ideaModel, draftModel } });
    console.log(`  ${s.domain}: ${ideaModel} / ${draftModel}`);
    changed++;
  }
}
console.log(`${changed} of ${sites.length} sites updated`);
await db.$disconnect();
