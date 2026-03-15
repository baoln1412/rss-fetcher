## Why

The current crime news pipeline has two fundamental issues: (1) it shells out to `claude -p` subprocess for all AI work — making it slow, fragile, and impossible to deploy on Vercel/serverless, and (2) it only caps at 10 articles from 15 RSS sources. The user needs 20+ hottest crime articles from an expanded list of US mainstream + specialist crime outlets, processed through NotebookLM MCP (which is now available natively) to produce Facebook-ready post content and Google Nano Banana 2 image prompts — all matching a very specific editorial style with Vietnamese-audience-tested formatting.

## What Changes

- **Expand RSS feed list** from 15 to 20+ sources covering all major US crime outlets (NYT, CNN, Fox, USA Today, NBC/ABC/CBS, WashPost, AP, Law & Crime, Court TV, Crime Online, Oxygen, People, Courthouse News)
- **Increase article cap** from 10 to 20+ per fetch, with smarter crime-keyword filtering to prioritize actual crime stories
- **Replace `claude -p` subprocess** with direct NotebookLM MCP integration (`notebooklm-mcp-server`) for article summarization — create notebook, add article URLs as sources, query for summaries
- **Rewrite content formatter** to use in-process AI (NotebookLM query) instead of spawning a Claude subprocess, producing Facebook posts that exactly match the user's style spec (emoji title ≤16 words, 4-paragraph body, CTA, 3-paragraph comment bait)
- **Add NB2 image prompt generator** that outputs a copy-pasteable prompt for Google Nano Banana 2 image generation with the exact format: 4:5 ratio, darkened background image, circular portrait with #f0e523 border, black eye-censor bar, Source Sans Variable Black font, yellow-highlighted key words
- **Improve PostCard UI** to display all outputs (Facebook text, comment bait, NB2 prompt) with one-click copy and better visual hierarchy
- **Add crime-keyword filtering** to ensure fetched articles are crime-relevant (filter by keywords: murder, kill, arrest, suspect, charged, shooting, stabbing, assault, robbery, kidnap, missing, court, trial, verdict, etc.)

## Capabilities

### New Capabilities

- `rss-source-expansion`: Expand RSS feed registry to 20+ US crime news sources with crime-specific RSS endpoints where available
- `crime-article-filter`: Smart keyword-based filtering to ensure only crime-related articles pass through the pipeline
- `notebooklm-summarizer`: Replace `claude -p` subprocess with direct NotebookLM MCP integration for article summarization (create temp notebook → add URL source → query for factual summary → delete notebook)
- `facebook-content-engine`: In-process content generation matching the exact editorial style spec — emoji title, 4-paragraph Facebook body, CTA, 3-paragraph comment bait, all avoiding Facebook-banned words
- `nb2-image-prompt`: Structured image prompt generator for Google Nano Banana 2 with exact design spec (4:5 ratio, background + circular portrait, #f0e523 accents, Source Sans Variable Black, eye-censor bars)

### Modified Capabilities

_None — no existing specs to modify._

## Impact

- **API routes**: `fetch-news/route.ts` (expanded feeds + filtering), `pipeline/route.ts` (new processing flow), `pipeline/article-processor.ts` (complete rewrite — remove `claude -p`, use NotebookLM MCP), `summarize/` (may be consolidated into pipeline)
- **Dependencies**: Remove dependency on `claude` CLI binary; add reliance on `notebooklm-mcp-server` running as MCP
- **UI**: `PostCard.tsx` updated with improved sections, `page.tsx` minor adjustments for higher article count
- **Types**: `types.ts` — minor additions for the NB2 prompt structure
- **Performance**: Sequential NotebookLM calls per article (~10-15s each × 20 articles = ~3-5 min total) — SSE streaming already handles this via progress events
- **Deployment**: No longer requires `claude` CLI on the server — NotebookLM MCP runs via authenticated cookies locally
