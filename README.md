# SEO Cursor

An AI-native SEO workspace. Your website is the project, SEO is the codebase, the agent is the developer.

**Everything in the database is measured.** The crawler reports what it actually found; Search Console reports what Google actually recorded. Nothing is estimated, and screens that have no real data behind them say so rather than filling the space.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Astro 5 (SSR, Node adapter) with React 19 islands |
| Crawling | Crawlee 3 — `CheerioCrawler` for HTTP, `PlaywrightCrawler` for client-rendered sites |
| LLM | Groq (fast open models) and OpenRouter (frontier models) — use either or both |
| Publishing | WordPress REST API with application passwords |
| Database | PostgreSQL on Neon |
| ORM | Prisma 6 |
| Validation | Zod on every API route |
| Styling | Hand-written CSS design system, no framework |

## Getting started

```bash
npm install
npx prisma db push
npm run dev                       # http://localhost:4330
npm run crawl https://example.com 100   # or crawl from the UI at /connect
```

`.env` needs `DATABASE_URL` (Neon pooled, with `pgbouncer=true`) and `DIRECT_URL` (non-pooled, for `db push`). See `.env.example`.

## Step one: what it does today

### Crawl

Give it a URL and it crawls for real:

- reads `robots.txt` and honours disallow rules and crawl-delay
- discovers `sitemap.xml`, following sitemap-index files one level down
- **detects whether the site needs a browser** — a client-rendered app returns an empty shell to a plain HTTP fetch, and every content rule downstream would then report "thin content, no H1" on every page. When the homepage looks like a shell, the whole crawl switches to Playwright
- extracts title, description, headings, canonical, robots meta, `og:` tags, JSON-LD and microdata types, language, viewport, word count, images and alt text, and every link
- follows internal links breadth-first up to the page cap
- checks every unique link target it found

### Findings

About twenty rules, all derived from what was measured — broken links, error pages, redirect chains, internal links pointing at redirects, missing and duplicate titles and descriptions, missing and multiple H1s, thin and duplicate content, missing canonicals, accidental `noindex`, orphan and weakly-linked pages, pages buried deeper than three clicks, images without alt text, missing structured data, missing social images, missing viewport, and slow responses.

Health scores are computed from the share of pages carrying each defect. Backlink authority is deliberately not scored: a crawl cannot observe it.

Two false-positive guards matter more than the rule count:

- **A non-200 is not automatically a broken link.** Bot protection routinely answers 401, 403 or 429 to a crawler while serving people fine, and a timeout says more about the network than the link. Only 404, 410 and 5xx are reported as broken; the rest are flagged "could not verify".
- **Orphan detection is suppressed on a capped crawl.** If the crawl stopped at the page limit, inbound link counts are a lower bound, and reporting orphans from incomplete data would be wrong.

Broken links are grouped by target, so one dead footer link on 21 pages reads as one problem rather than twenty-one.

### Google Search Console

The crawl sees what exists. Only Google can say what it earns. Connecting Search Console (read-only OAuth) pulls impressions, clicks and average position per page and per query, matches them onto crawled URLs, and surfaces the queries sitting on page two — the cheapest wins available.

**Setup** (needed once, before the Connect button works):

1. Create a project at `console.cloud.google.com`
2. Enable the **Google Search Console API**
3. Configure the OAuth consent screen (External; add yourself as a test user)
4. Create an **OAuth client ID**, type *Web application*
5. Add the redirect URI `http://localhost:4330/api/google/callback`
6. Put the credentials in `.env`:

```
GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-..."
GOOGLE_REDIRECT_URI="http://localhost:4330/api/google/callback"
```

Until those exist, Settings explains the setup instead of offering a button that cannot work.

## Step two: ideas, calendar, publishing

### Blog ideas

`/ideas` generates blog titles from the site's own data. The model is never asked what the site should write about in the abstract — it is handed the crawled pages, the Search Console queries sitting on page two, the queries earning impressions but no clicks, and the thin pages, then required to tie every suggestion to one of them. Each idea carries its rationale and the exact data point behind it.

You can generate more in a batch, add titles by hand, dismiss the ones you do not want, and schedule any of them.

Without Search Console the generator still works, but it says plainly that demand is unverified — it can see what you cover, not what people search for.

### Writing

**Generate blog now** writes the post immediately: an outline pass grounded in your real page list (so internal links point at URLs that exist), then the draft. The result lands in `/studio` for review.

### Scheduling

Put an idea on the calendar for a date. On that day the scheduler writes it. Tick **auto-publish** and it goes to WordPress too, without you touching it. `ranAt` makes the runner idempotent, so a cron firing every minute is harmless.

The in-app timer runs every 5 minutes while the server is up. For production, point a real cron at the endpoint:

```bash
curl -X POST -H "authorization: Bearer $CRON_SECRET" https://your-app/api/scheduler/tick
```

Without `CRON_SECRET` set, that endpoint only accepts local requests — an unprotected deployment cannot be triggered by anyone.

### Publishing

Connect WordPress in Settings with an **application password** (Users → Profile → Application Passwords), not your account password. Credentials are verified before they are stored, including whether the user can actually publish. Publish from the idea, the calendar or the studio; every path takes an explicit confirm.

## Setup for step two

```
GROQ_API_KEY="gsk_..."                 # console.groq.com/keys
OPENROUTER_API_KEY="sk-or-v1-..."      # openrouter.ai/keys
CRON_SECRET="any-long-random-string"   # only needed in production
```

**At least one** of the two model keys is required; set both if you want the full picker. They serve different purposes:

- **Groq** runs open models (GPT-OSS, Qwen) at roughly 1000 tokens a second with a free tier. Its catalogue changes often, so the model picker is filtered against the models your key can actually reach. Ideal for generating batches of titles, where speed and cost matter more than prose quality.
- **OpenRouter** gives one key access to Claude, GPT and Gemini. Worth it for drafting, where quality lands.

Model choice is per-site in Settings, and the picker only offers models whose provider has a working key. Stored references carry their provider — `groq:openai/gpt-oss-20b`, `openrouter:anthropic/claude-sonnet-5` — so switching provider is a dropdown, not a config change.

## Screens

| Live | |
| --- | --- |
| `/connect` | Add a website and watch the crawl run |
| `/` | Overview — measured facts, health, critical findings |
| `/audit` | Findings by severity and category, with every affected URL |
| `/pages` | Every crawled page, its on-page state and performance |
| `/pages/:id` | One page in detail |
| `/keywords` | What ranks, from Search Console |
| `/links` | Broken links, links to redirects, unverifiable links |
| `/ideas` | Blog titles, grounded in your data — generate, add, schedule |
| `/calendar` | Scheduled posts that write and publish themselves |
| `/studio` | Review drafts and publish to WordPress |
| `/settings` | Crawl, model, WordPress and Search Console connections |
| `/mcp` | The tool and resource contract |

Competitors and Opportunities are later steps. Their earlier mock-driven versions are parked under `src/pages/_later/` — out of the router, kept for reference.

## API

Every route validates with Zod and returns `{ ok, data }` or `{ ok: false, error, issues }`.

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/connect` | POST | Verify a URL is reachable, register it, start a crawl |
| `/api/crawl` | POST | Start a crawl |
| `/api/crawl/:id` | GET | Poll crawl progress |
| `/api/issue` | PATCH | Mark a finding resolved |
| `/api/google/auth` | GET | Begin Search Console OAuth |
| `/api/google/callback` | GET | Exchange the code, store the connection |
| `/api/google/property` | POST | Choose which property maps to this site |
| `/api/google/sync` | POST | Pull performance data |
| `/api/google/disconnect` | POST | Remove the connection — requires `confirm: true` |
| `/api/ideas` | POST | Generate blog titles from site data |
| `/api/ideas` | PUT | Add a title by hand |
| `/api/ideas/:id` | PATCH / DELETE | Edit or dismiss an idea |
| `/api/ideas/schedule` | POST / DELETE | Put an idea on the calendar, or take it off |
| `/api/blog/generate` | POST | Write the post for one idea |
| `/api/blog/publish` | POST | Push a draft to WordPress — requires `confirm: true` |
| `/api/wordpress/connect` | POST / DELETE | Connect or remove WordPress |
| `/api/settings/models` | POST | Choose which models to use |
| `/api/scheduler/tick` | POST | Run due scheduled items — the cron entry point |
| `/api/mcp/manifest` | GET | The MCP tool and resource contract |

## Scripts

```bash
npm run crawl <url> [maxPages]   # crawl from the CLI and print the findings
npm run render-check <url>       # compare HTTP vs browser rendering for one URL
npm run uicheck [domain]         # fetch every screen and report what rendered
npm run smoke                    # end-to-end check (needs the dev server)
npm run purge-mock               # delete everything not produced by a crawl
npm run llm-check                # show provider key status and model routing
```

## Structure

```
prisma/schema.prisma       sites, crawl jobs, pages, links, findings, GSC connection
src/lib/crawler/
  http.ts                  fetch with explicit redirect tracking
  robots.ts                robots.txt and sitemap discovery
  render.ts                HTTP-vs-browser detection
  parse.ts                 every on-page SEO signal
  linkcheck.ts             link resolution and verdict classification
  crawl.ts                 the Crawlee orchestrator
  issues.ts                the rules and the scoring
src/lib/google.ts          OAuth, token refresh, Search Analytics
src/lib/llm.ts             provider-aware LLM client (Groq + OpenRouter)
src/lib/ideas.ts           grounded title generation
src/lib/blog.ts            outline then draft
src/lib/wordpress.ts       REST publishing, Markdown to HTML
src/lib/scheduler.ts       the scheduled-day runner
src/lib/schemas.ts         Zod schemas and API helpers
src/pages/                 routes and API endpoints
src/islands/               React: onboarding, audit board, GSC panel
```

## Keyword research

Search Console reports what a site already earns — impressions, clicks and
position for queries Google actually showed it for. It has no opinion on terms
the site has never ranked for, and no measure of how hard anything is to win.
DataForSEO covers that half: monthly volume and a 0-100 difficulty for any
term, in a market you choose per website.

```
DATAFORSEO_LOGIN="you@example.com"
DATAFORSEO_PASSWORD="..."
```

Three research modes, each one billed API call regardless of how many keywords
come back:

| Mode | What it pulls |
| --- | --- |
| Keywords for this site | Everything the provider associates with the domain |
| Where we already rank | Terms the domain holds a position for, with the position |
| Ideas from seed terms | Related terms for words you supply |

`npm run keyword-check` verifies credentials and the market list without
spending anything; `--live` adds one small billed call.

Researched keywords feed the blog idea generator, which is then required to
quote volume and difficulty in its reasoning and to refuse topics guarded by a
difficulty a small site cannot beat.

## Why drafts used to be slop

The first version handed the writer a title, some headings, and the instruction
"be concrete, use specific numbers". With no facts supplied, the only way to
obey was to invent them — so it produced a fabricated pilot study, invented
ROC-AUC figures, and an API endpoint the product did not have, aimed at a
reader who would never run Python.

Three things changed:

**Grounding.** The crawler now stores each page's H2s and the first 1200
characters of its prose. Generation builds a fact sheet from that — what the
product is, what it does, what its pages say — and the writer may not reference
a capability that is not in it. Re-crawl a site before generating; without page
content the run refuses rather than inventing.

**Claim checking.** Every draft is scanned for unsourced statistics, figures
lifted from screenshots, invented endpoints, uncited research, code-span names
the site never uses, and links to pages that do not exist. Hits are returned as
`needsChecking` — surfaced for a person, never silently dropped. `npm run
fact-check` tests the detector against known good and bad sentences.

**A grade that measures the right things.** The old score counted headings and
word count, which is why a fabricated draft scored 83. The grade now leads with
trust — fabrications cost 10 points each — then direct-answer opening, FAQ
coverage, question headings, length, links and filler phrasing. Every check is
returned with the draft so you can see what failed and why.

Drafts are also written for AI answers, not only search: a self-contained
opening answer, sections that stand alone when quoted, question-shaped
headings, and an FAQ block emitted as FAQPage JSON-LD alongside Article schema.
