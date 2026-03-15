# Incremental SSE Pipeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the batch 3-step pipeline with a single SSE streaming endpoint that processes one article at a time — creating a NotebookLM notebook per article, generating the full post, deleting the notebook, then streaming the result to the UI so cards appear one-by-one.

**Architecture:** A new `POST /api/pipeline` route returns a `text/event-stream` response. It iterates articles sequentially, spawning one `claude -p` process per article that (1) creates a NotebookLM notebook, (2) adds the article URL as a source, (3) generates summary + facebookText + commentBait, (4) deletes the notebook, then (5) returns JSON. The UI reads the stream with `fetch` + `ReadableStream` reader and appends cards as they arrive.

**Tech Stack:** Next.js 14 App Router, TypeScript, Node.js `child_process.spawn`, `text/event-stream` (SSE), `claude -p` CLI with NotebookLM MCP

---

## Key Design Decisions

- **One `claude -p` per article** — does summarize + format in a single subprocess call. Simpler, no coordination needed.
- **SSE via POST** — `EventSource` only supports GET; we use `fetch` + `response.body` reader which supports POST and streaming.
- **Buffer incomplete SSE lines** — chunks from `reader.read()` may split mid-event; always accumulate into a line buffer.
- **Fallback inline** — if `claude -p` fails or times out for an article, emit a fallback post immediately and continue to the next article.
- **Old routes untouched** — `/api/summarize` and `/api/format-posts` stay as-is. Only `page.tsx` changes its pipeline call.

---

## Files to Create / Modify

| File | Action | Responsibility |
|---|---|---|
| `app/api/pipeline/article-processor.ts` | Create | Spawns `claude -p` for one article, returns `PostDraft` |
| `app/api/pipeline/route.ts` | Create | SSE endpoint — iterates articles, streams PostDraft events |
| `app/page.tsx` | Modify | Replace 3-step chain with SSE stream reader; show per-article progress |

---

## Chunk 1: Backend — article-processor + SSE route

### Task 1: Create `app/api/pipeline/article-processor.ts`

**Files:**
- Create: `app/api/pipeline/article-processor.ts`

- [ ] **Step 1: Create the file with full implementation**

```ts
import { spawn } from 'child_process';
import { Article, ArticleWithSummary, PostDraft } from '@/app/types';

const TIMEOUT_MS = 120_000; // 2 minutes per article

// ── Fallback helpers (inline to avoid importing from route files) ──────────

function pickEmoji(title: string): string {
  const lower = title.toLowerCase();
  if (/ax|axe|hatchet/.test(lower)) return '🪓';
  if (/stab|knife/.test(lower)) return '🔪';
  if (/gun|shoot|shot|firearm/.test(lower)) return '🔫';
  if (/fire|arson|burn/.test(lower)) return '🔥';
  if (/drown/.test(lower)) return '🌊';
  if (/drug|fentanyl|overdose/.test(lower)) return '💊';
  if (/murder|kill|dead|death/.test(lower)) return '💀';
  if (/arrest|police|cop/.test(lower)) return '🚔';
  if (/court|trial|judge|verdict/.test(lower)) return '⚖️';
  if (/missing|abduct|kidnap/.test(lower)) return '🔍';
  if (/explosion|bomb/.test(lower)) return '🧨';
  return '🚨';
}

function buildNb2Prompt(article: Article, emojiTitle: string): string {
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

export function buildFallbackPost(article: Article): PostDraft {
  const emoji = pickEmoji(article.title);
  const words = article.title.trim().split(/\s+/);
  const emojiTitle = `${words.slice(0, 15).join(' ')} ${emoji}`;
  const desc = article.description || 'A developing story that demands your attention.';

  const facebookText =
    `${emojiTitle}\n\n` +
    `${desc}\n\n` +
    `This story from ${article.source} continues to raise serious questions about public safety.\n\n` +
    `Authorities are investigating and more details are expected to emerge.\n\n` +
    `The circumstances surrounding this case demand accountability and answers.\n\n` +
    `👉 Please follow for more!`;

  const commentBait =
    `The details emerging from ${article.source} paint a disturbing picture that deserves closer examination.\n\n` +
    `What triggered these events — and why did no one intervene sooner?\n\n` +
    `Follow for updates as this story develops and justice is pursued for those affected.`;

  const articleWithSummary: ArticleWithSummary = { ...article, summary: desc };
  return {
    article: articleWithSummary,
    emojiTitle,
    facebookText,
    commentBait,
    nb2Prompt: buildNb2Prompt(article, emojiTitle),
  };
}

// ── Main export ───────────────────────────────────────────────────────────

export async function processArticle(article: Article): Promise<PostDraft> {
  const slug = article.title.slice(0, 40).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const notebookName = `crime-tmp-${slug}`;

  const prompt = `You have access to NotebookLM MCP tools. Follow these steps exactly for ONE article:

Article title: ${article.title}
Article URL: ${article.url}
Source: ${article.source}

STEPS:
1. Create a new notebook named "${notebookName}" using add_notebook.
2. Select it with select_notebook.
3. Add the article URL as a source using update_notebook (sources field with the URL).
4. Ask the notebook: "Write a detailed 3-4 paragraph factual summary of this article including: who is involved (full names, ages), what happened, key evidence or witness details, and how it was discovered."
5. Using the notebook's response, write the Facebook post content following the EXACT style rules below.
6. Delete the notebook using remove_notebook.
7. Output ONLY the JSON object from step 5 — no other text.

STYLE RULES (study this example output carefully):

Example facebookText:
"Indianapolis Man Arrested After Friend Finds Woman's Body in Backyard 🪓

What started as a heated argument over a car repair ended in a brutal homicide that has shaken an Indianapolis neighborhood. 45-year-old Travis Wolfe is behind bars, charged with the murder of his girlfriend, 51-year-old Kimberly Stewart.

The alarm was first raised by a long-time friend who stopped by Kimberly's home to pick up a car title. He noticed immediate \\"unusual\\" details: the dog was running wild outside, the back door was unlocked, and Kimberly - usually a dedicated UPS worker - was nowhere to be found. Following the sound of her ringing phone, the friend made a heartbreaking discovery: Kimberly's cold, stiff body lying between an outdoor spa and a wooden fence.

Police describe Wolfe as a \\"psychopath maniac\\" who was known to carry an ax and struggle with methamphetamine use. A crucial witness reported seeing a man swinging a \\"club or hammer\\" in the exact spot where Kimberly was found, while yelling at a dog to \\"shut up.\\" When detectives caught up with Wolfe, they found him driving the victim's car with a blood-stained ax hidden in the back seat.

Despite Wolfe's claims that he \\"didn't do it,\\" the forensic evidence and eyewitness accounts tell a much darker story of a man who let his rage turn a household tool into a deadly weapon.

👉 Please follow for more!"

Example commentBait:
"The forensic details in this affidavit are chillingly specific. The pathologist noted that Kimberly's head trauma was consistent with the \\"blunt side of an ax,\\" matching the tool found in the back of the BMW Wolfe was driving. To make matters worse, investigators used a specialized chemical (likely Luminol or a similar reagent) to reveal blood traces inside the vehicle that Wolfe had tried to hide.

The \\"water pump\\" argument seems to be the pathetic trigger for this senseless violence. According to the friend, Wolfe was furious over a failed repair on a BMW. This small mechanical frustration led to a \\"psychopath\\" level of rage.

Adding to the controversy: Wolfe was already \\"well-known\\" to the Southwest District officers and had an open warrant for being a \\"serious violent felon\\" in possession of a firearm. This brings up a massive point of contention - why was a known violent felon with an active warrant still walking the streets, eventually allowing him to escalate to murder? Kimberly Stewart, described by her family as a hardworking woman who loved fixing up cars, deserved a system that kept violent offenders behind bars before they picked up an ax."

RULES for facebookText:
- Line 1: headline ≤16 words + ONE specific emoji at the END (🪓 ax, 🔪 knife, 🔫 gun, 🔥 fire, 🌊 drowning, 💊 drugs, 💀 murder, 🚔 arrest, ⚖️ court, 🔍 missing)
- Empty line after headline
- Paragraph 1 (~2 sentences): "What started as [trigger] ended in [outcome]." + "[Suspect name, age] is behind bars charged with [crime] of [victim name, age if known]."
- Paragraph 2 (~3-4 sentences): Who discovered the crime, what details they noticed, sensory details, the discovery moment. Use real names and specific details.
- Paragraph 3 (~3 sentences): Suspect's background/character + witness account + key physical evidence found.
- Paragraph 4 (~2 sentences): Irony — contrast suspect's denial with evidence. Punchy conclusion.
- Empty line, then: "👉 Please follow for more!"

RULES for commentBait:
- Paragraph 1 (~3 sentences): Forensic/medical details, specific investigative techniques, physical evidence matching.
- Paragraph 2 (~2 sentences): The petty/small trigger that caused the violence. Express how absurd the trigger was.
- Paragraph 3 (~3-4 sentences): Prior record, open warrants, known to police — WHY was this person still free? End by naming the victim and what they deserved.

If the article URL cannot be added as a source (paywalled/blocked), write the post based solely on the article title and any context available.

Return ONLY this JSON (no markdown fences, no other text):
{"emojiTitle":"...","facebookText":"...","commentBait":"...","summary":"..."}`;

  const raw = await new Promise<string>((resolve, reject) => {
    const proc = spawn('claude', ['-p', prompt], { env: { ...process.env } });
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`claude -p timed out after ${TIMEOUT_MS / 1000}s for: ${article.title}`));
    }, TIMEOUT_MS);

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('error', (err) => { clearTimeout(timer); reject(err); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`claude exited ${code}: ${stderr.trim().slice(0, 200)}`));
      else resolve(stdout.trim());
    });
  });

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON object in output: ${raw.slice(0, 200)}`);

  const parsed = JSON.parse(jsonMatch[0]) as {
    emojiTitle: string;
    facebookText: string;
    commentBait: string;
    summary: string;
  };

  const articleWithSummary: ArticleWithSummary = {
    ...article,
    summary: parsed.summary ?? article.description,
  };

  return {
    article: articleWithSummary,
    emojiTitle: parsed.emojiTitle,
    facebookText: parsed.facebookText,
    commentBait: parsed.commentBait,
    nb2Prompt: buildNb2Prompt(article, parsed.emojiTitle),
  };
}
```

- [ ] **Step 2: Verify file was created**

```bash
ls /Users/lap15230/Documents/rss-fetcher/app/api/pipeline/
```
Expected: `article-processor.ts`

---

### Task 2: Create `app/api/pipeline/route.ts`

**Files:**
- Create: `app/api/pipeline/route.ts`

- [ ] **Step 1: Create the SSE streaming route**

```ts
import { NextRequest } from 'next/server';
import { Article } from '@/app/types';
import { processArticle, buildFallbackPost } from './article-processor';

export const maxDuration = 300; // 5 minutes total for all articles

export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.json();
  const articles: Article[] = body.articles ?? [];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        emit({ type: 'progress', current: i + 1, total: articles.length, title: article.title });

        try {
          console.log(`[pipeline] processing ${i + 1}/${articles.length}: ${article.title}`);
          const post = await processArticle(article);
          emit({ type: 'post', post });
        } catch (err) {
          console.error(`[pipeline] fallback for "${article.title}":`, err);
          const post = buildFallbackPost(article);
          emit({ type: 'post', post });
        }
      }

      emit({ type: 'done', total: articles.length });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/lap15230/Documents/rss-fetcher && node_modules/.bin/tsc --noEmit 2>&1
```
Expected: no errors

- [ ] **Step 3: Commit backend**

```bash
cd /Users/lap15230/Documents/rss-fetcher
git add app/api/pipeline/article-processor.ts app/api/pipeline/route.ts app/types.ts
git commit -m "feat: incremental SSE pipeline — one notebook per article, stream PostDrafts"
```

---

## Chunk 2: Frontend — SSE reader + progress UI

### Task 3: Update `app/page.tsx` to use SSE stream

**Files:**
- Modify: `app/page.tsx`

Current `page.tsx` calls three separate routes sequentially and waits for all. Replace with a single SSE stream from `/api/pipeline`.

- [ ] **Step 1: Update the Status type and messages**

Replace the `Status` type and `messages` map:

```ts
type Status = 'idle' | 'fetching' | 'processing' | 'done' | 'error';
```

- [ ] **Step 2: Add `progress` state**

Add alongside existing state declarations:
```ts
const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
```

- [ ] **Step 3: Replace `handleFetch` with the new SSE version**

Replace the entire `handleFetch` function:

```ts
async function handleFetch() {
  setStatus('fetching');
  setError(null);
  setPosts([]);
  setProgress(null);

  try {
    // Step 1: fetch articles
    const newsRes = await fetch('/api/fetch-news');
    if (!newsRes.ok) throw new Error('Failed to fetch news');
    const { articles } = await newsRes.json();
    setArticleCount(articles.length);

    // Step 2: stream posts via SSE
    setStatus('processing');
    const pipelineRes = await fetch('/api/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles }),
    });
    if (!pipelineRes.ok) throw new Error('Pipeline request failed');

    const reader = pipelineRes.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines from buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // keep incomplete last line in buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'post') {
            setPosts((prev) => [...prev, event.post]);
          } else if (event.type === 'progress') {
            setProgress({ current: event.current, total: event.total });
          } else if (event.type === 'done') {
            setStatus('done');
          }
        } catch {
          // malformed event line — skip
        }
      }
    }

    setStatus('done');
  } catch (err) {
    setError(err instanceof Error ? err.message : 'An error occurred');
    setStatus('error');
  }
}
```

- [ ] **Step 4: Update StatusBar to show progress**

Replace the `StatusBar` component:

```tsx
function StatusBar({
  status,
  articleCount,
  progress,
  error,
}: {
  status: Status;
  articleCount: number;
  progress: { current: number; total: number } | null;
  error: string | null;
}) {
  if (status === 'idle') return null;

  let message = '';
  if (status === 'fetching') message = '📡 Fetching news feeds...';
  else if (status === 'processing') {
    message = progress
      ? `⚙️ Processing article ${progress.current} of ${progress.total}...`
      : '⚙️ Starting pipeline...';
  } else if (status === 'done') message = `✅ ${articleCount} articles ready`;
  else if (status === 'error') message = `❌ ${error ?? 'An error occurred'}`;

  const isLoading = status === 'fetching' || status === 'processing';
  const isError = status === 'error';
  const isDone = status === 'done';

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium"
      style={{
        backgroundColor: isError ? '#3b0000' : isDone ? '#003b1a' : '#1a1a00',
        border: `1px solid ${isError ? '#7f0000' : isDone ? '#006b30' : '#4a4a00'}`,
        color: isError ? '#ff6b6b' : isDone ? '#6bffaa' : '#f0e523',
      }}
    >
      {isLoading && (
        <svg
          className="animate-spin h-4 w-4 flex-shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      <span>{message}</span>
    </div>
  );
}
```

- [ ] **Step 5: Update `isLoading` and pass `progress` to StatusBar**

Update `isLoading`:
```ts
const isLoading = status === 'fetching' || status === 'processing';
```

Update the `StatusBar` usage in JSX:
```tsx
<StatusBar status={status} articleCount={articleCount} progress={progress} error={error} />
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /Users/lap15230/Documents/rss-fetcher && node_modules/.bin/tsc --noEmit 2>&1
```
Expected: no errors

- [ ] **Step 7: Commit frontend**

```bash
cd /Users/lap15230/Documents/rss-fetcher
git add app/page.tsx
git commit -m "feat: stream post cards incrementally from SSE pipeline"
```

---

## Verification Checklist

- [ ] `app/api/pipeline/article-processor.ts` exports `processArticle` and `buildFallbackPost`
- [ ] `app/api/pipeline/route.ts` returns `Content-Type: text/event-stream`
- [ ] Terminal shows `[pipeline] processing 1/N:` logs as each article starts
- [ ] Post cards appear one-by-one in the UI (don't wait for all)
- [ ] Status bar shows "Processing article X of N..."
- [ ] If `claude` unavailable, fallback cards still appear
- [ ] NotebookLM notebooks are deleted after each article (check notebooklm.google.com — no leftover notebooks)
- [ ] `tsc --noEmit` passes
