import { Article, ArticleWithSummary, PostDraft } from '@/app/types';
import {
  createNotebook,
  addUrlSource,
  queryNotebook,
  deleteNotebook,
  isAvailable,
} from './notebooklm-client';

// ── Emoji picker ──────────────────────────────────────────────────────────

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

// ── Dramatic keyword identifier (for NB2 yellow highlight) ──────────────

const DRAMATIC_WORDS = [
  'murdered', 'murder', 'killed', 'killing', 'dead', 'death', 'deadly',
  'brutal', 'horrific', 'horrifying', 'shocking', 'gruesome',
  'stabbed', 'shot', 'strangled', 'beaten', 'burned',
  'arrested', 'charged', 'convicted', 'sentenced',
  'missing', 'abducted', 'kidnapped',
  'body', 'blood', 'weapon', 'victim',
  'psychopath', 'monster', 'predator',
];

function findDramaticKeywords(title: string): string[] {
  const words = title.split(/\s+/);
  const dramatic: string[] = [];
  for (const word of words) {
    const lower = word.toLowerCase().replace(/[^a-z]/g, '');
    if (DRAMATIC_WORDS.includes(lower)) {
      dramatic.push(word);
    }
  }
  // If no dramatic words found, pick the last 2-3 words as the hook
  if (dramatic.length === 0 && words.length > 3) {
    return words.slice(-3);
  }
  return dramatic.length > 0 ? dramatic : [words[0]];
}

// ── NB2 Image Prompt Builder ──────────────────────────────────────────────

function buildNb2Prompt(article: Article, emojiTitle: string): string {
  const dramaticWords = findDramaticKeywords(emojiTitle);
  const yellowWords = dramaticWords.join(', ');

  const bgSource = article.imageUrl
    ? `Use this image as background: ${article.imageUrl}`
    : 'Use a dark, moody crime scene background (police tape, dimly lit street, or courtroom)';

  const portraitSource = article.portraitUrl
    ? `Use this image for the portrait: ${article.portraitUrl}`
    : 'Use a shadowed silhouette portrait of a person';

  return `Create a 4:5 Instagram-format crime news image with the following specifications:

BACKGROUND:
- ${bgSource}
- Apply the image as full bleed, darkened by 40% with a dark overlay
- The background should feel dramatic and moody

CIRCULAR PORTRAIT (bottom-left area):
- ${portraitSource}
- Place in a circle frame, positioned in the bottom-left quadrant
- Size: approximately 30% of the image width
- Border: 8px solid #f0e523 (bright yellow)
- Add a black rectangle bar over the eyes of the person (privacy/dramatic effect)

TITLE TEXT (top area):
- Text: "${emojiTitle}"
- Font: Source Sans Variable - Black weight
- Position: top portion of the image, left-aligned with padding
- Highlight these key words in #f0e523 (yellow): ${yellowWords}
- All other words in white (#FFFFFF)
- Add a subtle drop shadow for readability against the dark background

BLACK EYE-CENSOR BAR:
- Add a black rectangle covering the eyes of any visible person in both the portrait and background
- This creates a dramatic true-crime visual effect

COLOR SCHEME:
- Primary accent: #f0e523 (bright yellow) for border, highlighted words
- Background: darkened/dimmed
- Text: white with yellow highlights
- Style: dark, dramatic crime news aesthetic`;
}

// ── Style-spec content prompt ─────────────────────────────────────────────

function buildContentPrompt(article: Article): string {
  return `You are writing content for a US crime news Facebook page targeting American audiences who follow crime news closely. Study this style carefully and follow it exactly.

ARTICLE TO PROCESS:
Title: ${article.title}
Source: ${article.source}
Description: ${article.description}

PRODUCE THREE OUTPUTS:

1. emojiTitle (≤16 words + ONE emoji at the end):
   - Rewrite the headline to be punchy, mass-audience friendly
   - Add an icon/emoji at the very END that matches the crime: ax→🪓, knife→🔪, gun→🔫, fire→🔥, drowning→🌊, drugs→💊, murder→💀, arrest→🚔, court→⚖️, missing→🔍
   - Keep under 16 words total (not counting the emoji)

2. facebookText (4 paragraphs + CTA):
   Paragraph 1 (~2 sentences): "What started as [trigger] ended in [outcome]." + "[Suspect name, age] is behind bars charged with [crime] of [victim name, age if known]."
   Paragraph 2 (~3-4 sentences): Who discovered the crime, what alerted them, sensory details, the discovery moment. Use real names and specific details.
   Paragraph 3 (~3 sentences): Suspect's character/background + witness account + key physical evidence found. Use direct quotes where available.
   Paragraph 4 (~2 sentences): Irony — contrast suspect's denial with evidence. End with a punchy observation.
   Then a blank line, then: "👉 Please follow for more!"

   IMPORTANT: Avoid Facebook-banned words. Keep language dramatic but safe for social media.

3. commentBait (3 paragraphs to provoke engagement):
   Paragraph 1 (~3 sentences): Forensic/medical deep dive — investigative techniques, physical evidence matching.
   Paragraph 2 (~2 sentences): The petty trigger — express dismay at how small the cause was.
   Paragraph 3 (~3-4 sentences): Prior record, open warrants, known to police → systemic critique: "why was this person still free?" End by naming the victim and what they deserved.

Return ONLY a JSON object with these fields (no markdown fences, no preamble):
{"emojiTitle":"...","facebookText":"...","commentBait":"...","summary":"3-4 paragraph factual summary of the article"}`;
}

// ── Fallback post builder ─────────────────────────────────────────────────

export function buildFallbackPost(article: Article): PostDraft {
  const emoji = pickEmoji(article.title);
  const words = article.title.trim().split(/\s+/);
  const emojiTitle = `${words.slice(0, 15).join(' ')} ${emoji}`;
  const desc = article.description || 'A developing story that demands your attention.';

  const facebookText =
    `${emojiTitle}\n\n` +
    `${desc}\n\n` +
    `This story from ${article.source} continues to raise serious questions about public safety and accountability.\n\n` +
    `The circumstances surrounding this case demand answers — and the community is watching closely.\n\n` +
    `👉 Please follow for more!`;

  const commentBait =
    `The details emerging from ${article.source} paint a disturbing picture that deserves closer examination by investigators and the public.\n\n` +
    `What triggered these events — and why did no one intervene sooner? The answer may shock you.\n\n` +
    `Follow for updates as this story develops and justice is pursued for those affected. Every victim deserves answers.`;

  const articleWithSummary: ArticleWithSummary = { ...article, summary: desc };
  return {
    article: articleWithSummary,
    emojiTitle,
    facebookText,
    commentBait,
    nb2Prompt: buildNb2Prompt(article, emojiTitle),
  };
}

// ── Main processor ────────────────────────────────────────────────────────

let sharedNotebookId: string | null = null;

/**
 * Initialize a shared notebook for the current pipeline run.
 * Call once before processing articles.
 */
export async function initPipelineNotebook(): Promise<string | null> {
  try {
    const available = await isAvailable();
    if (!available) {
      console.warn('[pipeline] NotebookLM MCP not available — using fallback mode');
      return null;
    }

    const today = new Date().toISOString().split('T')[0];
    const notebook = await createNotebook(`Crime News – ${today}`);
    sharedNotebookId = notebook.id;
    console.log(`[pipeline] Created shared notebook: ${notebook.id}`);
    return notebook.id;
  } catch (err) {
    console.error('[pipeline] Failed to create notebook:', err);
    return null;
  }
}

/**
 * Add an article URL to the shared notebook as a source.
 */
export async function addArticleSource(article: Article): Promise<boolean> {
  if (!sharedNotebookId) return false;
  try {
    await addUrlSource(sharedNotebookId, article.url);
    return true;
  } catch {
    console.warn(`[pipeline] Failed to add source: ${article.url}`);
    return false;
  }
}

/**
 * Process a single article using NotebookLM for content generation.
 */
export async function processArticle(article: Article): Promise<PostDraft> {
  // If no shared notebook, use fallback immediately
  if (!sharedNotebookId) {
    console.log(`[pipeline] No notebook — using fallback for: ${article.title}`);
    return buildFallbackPost(article);
  }

  try {
    // Query the notebook for content generation
    const prompt = buildContentPrompt(article);
    const raw = await queryNotebook(sharedNotebookId, prompt);

    // Try to parse JSON from the response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`[pipeline] No JSON in NotebookLM response for "${article.title}", using fallback`);
      return buildFallbackPost(article);
    }

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
  } catch (err) {
    console.error(`[pipeline] NotebookLM query failed for "${article.title}":`, err);
    return buildFallbackPost(article);
  }
}

/**
 * Cleanup the shared notebook after the pipeline run.
 */
export async function cleanupPipelineNotebook(): Promise<void> {
  if (!sharedNotebookId) return;
  try {
    await deleteNotebook(sharedNotebookId);
    console.log(`[pipeline] Cleaned up notebook: ${sharedNotebookId}`);
  } catch (err) {
    console.warn('[pipeline] Failed to cleanup notebook:', err);
  } finally {
    sharedNotebookId = null;
  }
}
