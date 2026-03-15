# AI Post Formatter Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace template-generated Facebook drafts with AI-written content (via `claude -p`) that matches the example post format: story-driven 4-paragraph post + emoji title at end + `👉 Please follow for more!` CTA + a "Comment Bait" (seed comment) section with 3 analytical paragraphs.

**Architecture:** `format-posts/route.ts` tries a new `claude-formatter.ts` module (spawns `claude -p` with the article + summary), falls back to the existing template functions on any error. `PostDraft` gains a `commentBait` field. `PostCard.tsx` adds a copyable Comment Bait section below the Facebook Draft section.

**Tech Stack:** Next.js 14 App Router, TypeScript, Node.js `child_process.spawn`, `claude -p` CLI

---

## Example Target Output

**Facebook Post:**
```
Indianapolis Man Arrested After Friend Finds Woman's Body in Backyard 🪓

What started as a heated argument over a car repair ended in a brutal homicide...

The alarm was first raised by a long-time friend who stopped by...

Police describe Wolfe as a "psychopath maniac" who was known to carry an ax...

Despite Wolfe's claims that he "didn't do it," the forensic evidence...

👉 Please follow for more!
```

**Comment Bait (3 analytical paragraphs raising controversy):**
```
The forensic details in this affidavit are chillingly specific...

The "water pump" argument seems to be the pathetic trigger for this senseless violence...

Adding to the controversy: Wolfe was already "well-known" to officers...
```

---

## Files to Create / Modify

| File | Action | Responsibility |
|---|---|---|
| `app/types.ts` | Modify | Add `commentBait: string` to `PostDraft` |
| `app/api/format-posts/claude-formatter.ts` | Create | Spawn `claude -p`, return `FormattedPost[]`, fall back per-article |
| `app/api/format-posts/route.ts` | Modify | Try `spawnClaudeFormatter`, fall back to templates |
| `app/components/PostCard.tsx` | Modify | Render Comment Bait section with copy button |

---

## Chunk 1: Types + Formatter Module

### Task 1: Add `commentBait` to `PostDraft`

**Files:**
- Modify: `app/types.ts`

- [ ] **Step 1: Add the field**

In `app/types.ts`, update `PostDraft`:

```ts
export interface PostDraft {
  article: ArticleWithSummary;
  facebookText: string;  // full Facebook post draft
  nb2Prompt: string;     // Nano Banana 2 image generation prompt
  emojiTitle: string;    // <=16 word title with emoji at end
  commentBait: string;   // seed comment — 3 analytical paragraphs
}
```

- [ ] **Step 2: Verify TypeScript still compiles**

```bash
cd /Users/lap15230/Documents/rss-fetcher && node_modules/.bin/tsc --noEmit
```
Expected: no errors (route.ts will error until we fix it — that's fine, check after Task 3)

---

### Task 2: Create `app/api/format-posts/claude-formatter.ts`

**Files:**
- Create: `app/api/format-posts/claude-formatter.ts`

- [ ] **Step 1: Create the file**

```ts
import { spawn } from 'child_process';
import { ArticleWithSummary, PostDraft } from '@/app/types';
import { buildFallbackPost } from './route-helpers';

interface ClaudeFormattedItem {
  url: string;
  emojiTitle: string;
  facebookText: string;
  commentBait: string;
}

export async function spawnClaudeFormatter(
  articles: ArticleWithSummary[]
): Promise<PostDraft[]> {
  const today = new Date().toISOString().split('T')[0];

  const articleList = articles
    .map(
      (a, i) =>
        `Article ${i + 1}:\nURL: ${a.url}\nTitle: ${a.title}\nSource: ${a.source}\nSummary:\n${a.summary}`
    )
    .join('\n\n---\n\n');

  const prompt = `Today is ${today}. You are writing content for a Vietnamese crime news Facebook page that posts in English.

For each article below, produce:
1. **emojiTitle** — the headline rewritten to be punchy and engaging (≤16 words), with one highly relevant emoji placed at the END (e.g. "Indianapolis Man Arrested After Friend Finds Woman's Body in Backyard 🪓"). Choose the emoji based on the specific weapon, crime type, or key detail.
2. **facebookText** — exactly 4 paragraphs telling the story in a compelling, dramatic-but-factual way, then a final line: "👉 Please follow for more!" (blank line before it). Paragraph style: hook → discovery/witness details → perpetrator/evidence → conclusion/irony. No section labels.
3. **commentBait** — exactly 3 analytical paragraphs (no labels) that deepen controversy and raise pointed questions: forensic specifics, the trigger/motive, and a systemic critique (e.g. why was this person free?). This will be posted as the first comment to drive engagement.

Return ONLY a JSON array — no markdown fences, no explanation:
[{"url":"...","emojiTitle":"...","facebookText":"...","commentBait":"..."}]

Articles:
${articleList}`;

  const raw = await new Promise<string>((resolve, reject) => {
    const proc = spawn('claude', ['-p', prompt], { env: { ...process.env } });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('error', (err) => reject(new Error(`Failed to spawn claude: ${err.message}`)));
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`claude exited ${code}: ${stderr.trim()}`));
      else resolve(stdout.trim());
    });
  });

  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`No JSON array in claude output: ${raw.slice(0, 200)}`);

  const parsed: ClaudeFormattedItem[] = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty result from claude');

  const map = new Map(parsed.map((item) => [item.url, item]));

  return articles.map((article) => {
    const item = map.get(article.url);
    if (item) {
      const nb2Prompt = buildNb2Prompt(article, item.emojiTitle);
      return {
        article,
        emojiTitle: item.emojiTitle,
        facebookText: item.facebookText,
        commentBait: item.commentBait,
        nb2Prompt,
      };
    }
    return buildFallbackPost(article);
  });
}

function buildNb2Prompt(article: ArticleWithSummary, emojiTitle: string): string {
  const imageUrl = article.imageUrl ?? 'dark crime scene background';
  const portraitUrl = article.portraitUrl ?? 'news anchor silhouette';
  return (
    `Create a 4:5 Instagram-format image:\n` +
    `BACKGROUND: ${imageUrl} full bleed, darkened 40%\n` +
    `CIRCULAR PORTRAIT: bottom-left, 30% width, source: ${portraitUrl}, border 8px #f0e523, black rectangle over eyes\n` +
    `TITLE TEXT (Source Sans Variable Black, top area): "${emojiTitle}" — key words in #f0e523, rest white, drop shadow\n` +
    `STYLE: dark, dramatic crime news aesthetic`
  );
}
```

- [ ] **Step 2: Note — `buildFallbackPost` will be extracted in Task 3 from route.ts**

---

## Chunk 2: Route + UI

### Task 3: Refactor `format-posts/route.ts`

The goal: extract fallback logic into a helper, try `spawnClaudeFormatter`, fall back gracefully.

**Files:**
- Modify: `app/api/format-posts/route.ts`

- [ ] **Step 1: Rewrite `route.ts`**

Replace the entire file with:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { ArticleWithSummary, PostDraft } from '@/app/types';
import { spawnClaudeFormatter } from './claude-formatter';

export const maxDuration = 90;

const PAGE_NAME = 'Crime News Daily';

function pickEmoji(title: string): string {
  const lower = title.toLowerCase();
  if (/ax|axe|hatchet/.test(lower)) return '🪓';
  if (/gun|shoot|shot|firearm/.test(lower)) return '🔫';
  if (/knife|stab/.test(lower)) return '🔪';
  if (/murder|kill|dead|death/.test(lower)) return '💀';
  if (/arrest|police|cop/.test(lower)) return '🚔';
  if (/court|trial|judge|verdict/.test(lower)) return '⚖️';
  if (/missing|abduct|kidnap/.test(lower)) return '🔍';
  if (/explosion|bomb/.test(lower)) return '🧨';
  return '🚨';
}

function buildEmojiTitle(article: ArticleWithSummary): string {
  const emoji = pickEmoji(article.title);
  const words = article.title.trim().split(/\s+/);
  const truncated = words.slice(0, 16).join(' ');
  return `${truncated} ${emoji}`;
}

function extractParagraphs(summary: string): string[] {
  const byDoubleNewline = summary
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byDoubleNewline.length >= 2) return byDoubleNewline;
  const sentences = summary.match(/[^.!?]+[.!?]+/g) ?? [summary];
  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    paragraphs.push(sentences.slice(i, i + 2).join(' ').trim());
  }
  return paragraphs.filter(Boolean);
}

function buildNb2Prompt(article: ArticleWithSummary, emojiTitle: string): string {
  const imageUrl = article.imageUrl ?? 'dark crime scene background';
  const portraitUrl = article.portraitUrl ?? 'news anchor silhouette';
  return (
    `Create a 4:5 Instagram-format image:\n` +
    `BACKGROUND: ${imageUrl} full bleed, darkened 40%\n` +
    `CIRCULAR PORTRAIT: bottom-left, 30% width, source: ${portraitUrl}, border 8px #f0e523, black rectangle over eyes\n` +
    `TITLE TEXT (Source Sans Variable Black, top area): "${emojiTitle}" — key words in #f0e523, rest white, drop shadow\n` +
    `STYLE: dark, dramatic crime news aesthetic`
  );
}

export function buildFallbackPost(article: ArticleWithSummary): PostDraft {
  const emojiTitle = buildEmojiTitle(article);
  const paragraphs = extractParagraphs(article.summary);

  const p1 = paragraphs[0] ?? article.description ?? 'A developing story that demands your attention.';
  const p2 = paragraphs[1] ?? paragraphs[0] ?? 'The details surrounding this case continue to shock the community.';
  const p3 = paragraphs[2] ?? 'The question everyone is asking: how did this happen, and who is responsible?';
  const p4 = paragraphs[3] ?? 'Stay tuned as more details emerge.';

  const facebookText = `${emojiTitle}\n\n${p1}\n\n${p2}\n\n${p3}\n\n${p4}\n\n👉 Please follow for more!`;

  const commentBait = [
    p2,
    `The circumstances surrounding this case raise serious questions about how this was allowed to happen.`,
    `Follow ${PAGE_NAME} for more updates as this story develops.`,
  ].join('\n\n');

  return {
    article,
    emojiTitle,
    facebookText,
    commentBait,
    nb2Prompt: buildNb2Prompt(article, emojiTitle),
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const articles: ArticleWithSummary[] = body.articles ?? [];

  try {
    console.log('[format-posts] spawning claude -p for AI formatting...');
    const posts = await spawnClaudeFormatter(articles);
    return NextResponse.json({ posts });
  } catch (err) {
    console.error('[format-posts] AI formatter failed, using fallback:', err);
    const posts: PostDraft[] = articles.map(buildFallbackPost);
    return NextResponse.json({ posts });
  }
}
```

- [ ] **Step 2: Fix the import in `claude-formatter.ts`**

Update the import in `claude-formatter.ts` from `'./route-helpers'` to `'./route'`:

```ts
import { buildFallbackPost } from './route';
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/lap15230/Documents/rss-fetcher && node_modules/.bin/tsc --noEmit
```
Expected: no errors

---

### Task 4: Add Comment Bait section to `PostCard.tsx`

**Files:**
- Modify: `app/components/PostCard.tsx`

- [ ] **Step 1: Destructure `commentBait` from `post`**

In `PostCard.tsx` line 48, add `commentBait` to the destructure:

```ts
const { article, facebookText, nb2Prompt, emojiTitle, commentBait } = post;
```

- [ ] **Step 2: Add Comment Bait section after the Facebook Draft section**

After the closing `</div>` of the Facebook Draft section (around line 169), add:

```tsx
{/* Comment Bait section */}
<div
  className="rounded-lg p-3"
  style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}
>
  <div className="flex items-center justify-between mb-2">
    <span
      className="text-xs font-semibold tracking-widest uppercase"
      style={{ color: '#f0e523' }}
    >
      Comment Bait
    </span>
    <CopyButton text={commentBait} ariaLabel="Copy comment bait" />
  </div>
  <p
    className="text-sm text-gray-200 whitespace-pre-wrap break-words select-all"
    style={{ lineHeight: '1.6' }}
  >
    {commentBait}
  </p>
</div>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/lap15230/Documents/rss-fetcher && node_modules/.bin/tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
cd /Users/lap15230/Documents/rss-fetcher
git add app/types.ts app/api/format-posts/claude-formatter.ts app/api/format-posts/route.ts app/components/PostCard.tsx
git commit -m "feat: AI-generated Facebook text + Comment Bait via claude -p"
```

---

## Verification Checklist

- [ ] `PostDraft.commentBait` field exists in `app/types.ts`
- [ ] `format-posts/route.ts` exports `buildFallbackPost` and has `maxDuration = 90`
- [ ] `claude-formatter.ts` exports `spawnClaudeFormatter`
- [ ] Emoji appears at END of title (e.g. `"Man Arrested After Body Found 🪓"`)
- [ ] CTA is `👉 Please follow for more!` (not old "Follow Crime News Daily...")
- [ ] Comment Bait section visible in UI with copy button
- [ ] If `claude` is unavailable, UI still works with fallback content
- [ ] `npm run build` passes (or `tsc --noEmit` if build tooling not in PATH)
