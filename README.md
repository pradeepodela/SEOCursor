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


### Categories and tags

Each draft carries its own category and tags, held **by name** rather than by ID — names are what a person and a model both reason about, and they survive a site being reconnected, where an ID would silently point at whatever term now holds that number.

The writer proposes them. The outline pass is handed the categories that actually exist on your site and must pick one of them verbatim, so a category it invents is dropped rather than published into nothing; tags are free-form and it is asked for three to six specific ones. Nothing is applied until you publish, and the studio marks them **Suggested** until you touch them — the same rule the claim checking follows: surface it, never quietly act as though someone approved it.

The two taxonomies are treated differently on publish, following what WordPress itself does:

- **Tags are created** if they do not exist. That is what tags are for.
- **Categories are not.** A category is a structure someone designed, and inventing one would reshape the site's navigation as a side effect of publishing. An unmatched category is reported back — the post is live, but not where you meant it to go — and `createCategories: true` is the explicit opt-in.

Term names arrive HTML-encoded from the REST API (`Membership &amp; Retention`), so they are decoded at the boundary. Comparing the raw strings would mean a category you picked never matched, and the post publishing with no category and no error.

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
| `/api/blog/terms` | PATCH | Set a draft's WordPress categories and tags |
| `/api/blog/publish` | POST | Push a draft to WordPress — requires `confirm: true` |
| `/api/wordpress/terms` | GET | Categories and tags on the connected WordPress site |
| `/api/wordpress/connect` | POST / DELETE | Connect or remove WordPress |
| `/api/settings/models` | POST | Choose which models to use |
| `/api/scheduler/tick` | POST | Run due scheduled items — the cron entry point |
| `/api/mcp` | POST | MCP over Streamable HTTP — the transport itself |
| `/api/mcp/manifest` | GET | The MCP contract, readable in a browser |

## MCP

The workspace is one client of this data. An agent is another.

Everything the UI can do is exposed as MCP tools — 25 of them — so Claude,
Cursor or anything else that speaks MCP can crawl a site, read the findings,
look at what ranks, write a post and publish it. Tools call `src/lib` directly
rather than looping back through the HTTP API, because the stdio transport runs
as a bare node process with no server in front of it.

### Interactive views

Four tools ship as **MCP Apps** — they return an interactive view the host
renders inline, not just text:

| Tool | View |
| --- | --- |
| `audit_site` | Findings by severity and category, with a one-click resolve |
| `get_pages` | Sortable table of every crawled page |
| `get_rankings` | Queries from Search Console, page-two near-misses called out |
| `list_ideas` | Ideas with their evidence, and a button to write or dismiss one |

Each view is one self-contained HTML file with React and the CSS inlined. That
is not an optimisation — an MCP App runs in a sandboxed iframe with no
same-origin server and a default CSP of `default-src 'none'`, so an external
script or stylesheet is blocked silently and the panel renders blank. The views
take their colours from the host's own design tokens, so they match the
surrounding client in light and dark.

Every one of those tools also returns a complete written answer, so a client
with no MCP Apps support gets the same information from the same call.

### Connecting

```bash
npm run build:mcp                 # required once — builds the views and the binary

# Claude Code
claude mcp add seo-cursor -- node "$PWD/bin/seo-mcp.mjs"
```

Or in a desktop client's config:

```json
{
  "mcpServers": {
    "seo-cursor": {
      "command": "node",
      "args": ["/absolute/path/to/bin/seo-mcp.mjs"]
    }
  }
}
```

The binary reads this workspace's own database, so it needs `DATABASE_URL` —
run it from the project directory and it picks that up from `.env`.

### Over HTTP

The same server is served at `POST /api/mcp` by the Astro app, for clients that
connect to a URL rather than spawning a process:

```bash
claude mcp add --transport http seo-cursor http://localhost:4330/api/mcp
```

**This one is guarded, and deliberately so.** These tools crawl other people's
websites, spend LLM and DataForSEO credits, and can publish to a live
WordPress site — an open endpoint is a stranger's budget and byline. In
production it refuses to serve without `MCP_TOKEN` set, sent as
`Authorization: Bearer <token>`; and because a browser will happily attach
credentials to a cross-origin request, non-localhost `Origin` headers are
rejected unless listed in `MCP_ALLOWED_ORIGINS`. Locally, with no token
configured, neither applies.

### What it will not tell you

The same rule the rest of the workspace follows. Tools report what was
measured, and say so when a number is a lower bound: ask for pages after a
crawl that hit its page cap and the result states that inbound-link counts are
incomplete, so an agent does not read a low count as an orphan page and
recommend deleting a well-linked page. Search Console tools fail with an
explanation rather than returning an empty list that reads like "you rank for
nothing". Backlink authority is absent, because a crawl cannot observe it.

`npm run mcp-check` speaks raw JSON-RPC at the server and verifies the
handshake, the tool list, the `ui://` resources and a real tool call against
the live database. It also asserts that the published contract in
`src/lib/mcp.ts` and the tools the server actually registers are the same set,
so a tool cannot be added without being documented.

## Deploying

**Railway, not Vercel.** Four things here need a persistent process, and
serverless breaks all of them: crawls run detached from the request that starts
them (`void runCrawl(...)` — a serverless function is frozen the moment it
responds, leaving the job stuck in `RUNNING`), Chromium does not fit in a
250 MB function bundle, `generate_blog` runs for a minute or two, and the MCP
views are read from disk at request time so file tracing never bundles them.
Any persistent-container host works — Railway, Render, Fly, a VPS.

The repo ships a `Dockerfile` and `railway.toml`. Point Railway at the repo and
it builds from the Dockerfile.

### The image

Built on `mcr.microsoft.com/playwright:v1.63.0-noble` rather than a slim Node
base, because the crawler switches to a headless browser for client-rendered
sites and Chromium needs system libraries no slim image ships. **The tag must
match the `playwright` version in package.json exactly** — a mismatch surfaces
as "Executable doesn't exist" at crawl time, not at deploy time.

### Environment

| Variable | Needed | Notes |
| --- | --- | --- |
| `DATABASE_URL` | always | Neon pooled, `pgbouncer=true` |
| `DIRECT_URL` | always | Non-pooled, for `prisma db push` |
| `MCP_TOKEN` | always | **`/api/mcp` returns 503 without it in production.** Send as `Authorization: Bearer` |
| `CRON_SECRET` | always | Or the scheduler endpoint takes local requests only — and cron runs in a different container |
| `GROQ_API_KEY` / `OPENROUTER_API_KEY` | for writing | At least one |
| `GOOGLE_CLIENT_ID` / `_SECRET` | for Search Console | |
| `GOOGLE_REDIRECT_URI` | for Search Console | **Must change to the deployed domain**, and be re-added in Google Cloud Console, or OAuth breaks |
| `DATAFORSEO_LOGIN` / `_PASSWORD` | for keyword research | |
| `MCP_ALLOWED_ORIGINS` | rarely | Browser origins allowed to reach `/api/mcp`. Hostnames, comma-separated |

`HOST` and `PORT` are set by the Dockerfile and Railway; leave them alone.

Do not set `DISABLE_SCHEDULER` — the in-app timer is already the wrong thing in
production, and the cron service below replaces it.

### The scheduler needs its own service

Railway triggers a cron by running a service's start command, and a service
whose process stays up blocks its own next run — so a cron cannot share a
service with a web server. Add a **second** service from the same repo:

- Start command: `npm run scheduler:tick`
- Cron schedule: `*/15 * * * *`
- Env: `CRON_SECRET` (same value as the web service) and
  `SCHEDULER_URL` set to the web service's public URL

It fires one tick and exits. `ranAt` makes the endpoint idempotent, so an extra
firing is harmless, and a non-zero exit shows the run as failed rather than
silently passing.

> One trap worth knowing: Astro's `security.checkOrigin` is on by default and
> rejects a `POST` carrying no `content-type` as a cross-site form submission —
> a 403 raised before the route's own auth runs. A hand-rolled
> `curl -X POST -H "authorization: Bearer ..."` against `/api/scheduler/tick`
> therefore fails, and looks like an auth problem when it never reached the
> route. Send `content-type: application/json` too; `npm run scheduler:tick`
> already does.

### After the first deploy

```bash
npx prisma db push                                    # once, against DIRECT_URL
MCP_TOKEN=... npm run deploy-check https://your-app.up.railway.app
```

`deploy-check` verifies the server is up, that `/api/mcp` refuses
unauthenticated calls, that the handshake and tool list work, that the `ui://`
views actually made it into the image, and that the database is attached — the
things that break between a green build and a working deployment.

Then connect an agent to it:

```bash
claude mcp add --transport http seo-cursor https://your-app.up.railway.app/api/mcp \
  --header "Authorization: Bearer $MCP_TOKEN"
```

### Sizing

Chromium plus a 500-page crawl is the memory ceiling, not the web server. Start
at 1 GB and watch the first real crawl. Keep it at one instance: crawl jobs are
claimed without a database lock, so two instances would race on the same job.

## Scripts

```bash
npm run crawl <url> [maxPages]   # crawl from the CLI and print the findings
npm run render-check <url>       # compare HTTP vs browser rendering for one URL
npm run uicheck [domain]         # fetch every screen and report what rendered
npm run smoke                    # end-to-end check (needs the dev server)
npm run purge-mock               # delete everything not produced by a crawl
npm run llm-check                # show provider key status and model routing
npm run build:mcp                # build the MCP app views and the stdio binary
npm run mcp-check                # speak JSON-RPC at the MCP server and verify it
npm run deploy-check <url>       # verify a deployed instance from outside
npm run scheduler:tick           # fire the scheduler once and exit (the cron entry point)
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
src/mcp/
  server.ts                the MCP server — one factory, both transports
  context.ts               site resolution and tool-result helpers
  stdio.ts                 stdio entry point, bundled to bin/seo-mcp.mjs
  tools/                   tool handlers, calling src/lib directly
  apps/registry.ts         the ui:// catalogue
  apps/src/                the interactive views (React)
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
