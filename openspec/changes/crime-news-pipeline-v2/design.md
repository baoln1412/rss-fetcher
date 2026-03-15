## Context

The `crime-news-fb-tool` is a Next.js 14 app that fetches crime news from 15 RSS feeds, processes them through a pipeline (`claude -p` subprocess → NotebookLM), and outputs Facebook post drafts with comment bait and NB2 image prompts. The current architecture spawns an external `claude` CLI process for each article — this is slow (~2 min/article), fragile (depends on Claude CLI being installed + authenticated), and incompatible with serverless deployment.

The NotebookLM MCP server is now installed locally and authenticated (`~/.notebooklm-mcp/auth.json`). This enables direct, in-process interaction with NotebookLM for article summarization without subprocess overhead.

The user's editorial requirements are precisely defined with an example post demonstrating exact paragraph structure, tone, emoji usage, and comment bait format targeting a US audience interested in crime news.

## Goals / Non-Goals

**Goals:**
- Fetch 20+ crime-relevant articles from an expanded roster of 20+ US mainstream + specialist crime RSS feeds
- Replace `claude -p` subprocess calls with direct NotebookLM MCP tool calls for article summarization
- Generate Facebook-ready content (title, body, CTA, comment bait) matching exact editorial spec
- Generate structured NB2 image prompts per the design spec (4:5, background + circular portrait, yellow accents, eye-censor bars)
- Maintain SSE streaming for real-time progress in the UI
- Keep the tool running locally (not serverless) since NotebookLM MCP requires local cookie auth

**Non-Goals:**
- Automated posting to Facebook (this is a draft generation tool)
- Actual image generation (just prompt text for manual NB2 input)
- Multi-user / auth system — single-user local tool
- Automated NotebookLM re-authentication (manual `notebooklm-mcp-auth` when cookies expire)
- Full article text scraping (rely on RSS descriptions + NotebookLM's URL source ingestion)

## Decisions

### 1. NotebookLM MCP via direct tool calls vs. continuing `claude -p` subprocess

**Decision**: Use the NotebookLM MCP server tools directly through the MCP SDK.

**Rationale**: The `claude -p` approach spawns an entire Claude CLI process per article, each taking ~2 minutes. With the NotebookLM MCP server now running natively, we can call `notebook_create`, `notebook_add_url`, `notebook_query`, and `notebook_delete` directly — no subprocess overhead, better error handling, and cleaner code.

**Alternative rejected**: Keeping `claude -p` — too slow (20 articles × 2 min = 40 min), depends on external CLI, and can't run on Vercel.

### 2. One shared notebook per run vs. one notebook per article

**Decision**: Use one shared notebook per run (named with today's date), adding all article URLs as sources, then querying once for batch summarization.

**Rationale**: Creating/deleting 20 individual notebooks is slow and risks rate limiting. A single notebook with multiple sources allows batch queries and is more efficient. The notebook is cleaned up after the run completes.

**Alternative rejected**: Per-article notebooks — 20 create/delete cycles adds ~30s overhead each just for lifecycle management.

### 3. Content formatting — in-process template engine vs. AI call

**Decision**: Use NotebookLM `notebook_query` with a detailed style prompt for each article to generate Facebook content, with a robust in-process fallback formatter for when the query fails.

**Rationale**: NotebookLM has the article content already ingested as a source — querying it with specific formatting instructions produces high-quality, grounded content. The fallback formatter (already exists in `article-processor.ts`) ensures no articles are lost even if the MCP call fails.

### 4. Crime keyword filtering strategy

**Decision**: Apply a two-tier filter: (1) prefer crime-specific RSS endpoints where available, (2) apply keyword matching (`murder`, `kill`, `arrest`, `suspect`, `charged`, `shooting`, etc.) on article titles and descriptions for general feeds.

**Rationale**: Some feeds (CNN Crime, NBC Crime Courts, CBS Crime) have dedicated crime RSS URLs. General feeds (AP, NYT US) need keyword filtering to avoid non-crime articles diluting the output.

### 5. NB2 prompt generation — structured template

**Decision**: Generate NB2 prompts as structured text templates using article metadata (imageUrl, portraitUrl, emojiTitle). These are copy-pasteable strings, not API calls.

**Rationale**: Google Nano Banana 2 is used via its web UI. The user manually pastes the prompt. The template follows the exact design spec: 4:5 ratio, darkened background, circular portrait with `#f0e523` border, eye-censor bar, Source Sans Variable Black font, yellow-highlighted keywords.

## Risks / Trade-offs

- **[Risk] NotebookLM rate limiting**: Batch adding 20 URLs may hit internal API limits → Mitigation: add URLs with short delays between them; fall back to RSS description if URL ingestion fails
- **[Risk] NotebookLM cookie expiration**: Auth cookies expire ~every 2 weeks → Mitigation: clear error message prompting user to re-run `notebooklm-mcp-auth`
- **[Risk] RSS feeds changing URLs/format**: Publishers occasionally restructure feeds → Mitigation: `Promise.allSettled` per feed with individual error handling (already implemented)
- **[Risk] Paywalled articles**: NYT / WashPost articles may not be fully ingestible by NotebookLM → Mitigation: fall back to RSS description + fallback formatter
- **[Trade-off] Sequential processing**: SSE streaming implies sequential article processing; 20 articles at ~15s each = ~5 min total run. Acceptable for a local tool with progress UI.
