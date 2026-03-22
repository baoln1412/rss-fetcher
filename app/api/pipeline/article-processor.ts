import { Article, ArticleWithSummary, PostDraft } from '@/app/types';
import {
  createNotebook,
  addUrlSource,
  queryNotebook,
  deleteNotebook,
  isAvailable as isNotebookLmAvailable,
} from './notebooklm-client';
import {
  generateContent as geminiGenerate,
  isAvailable as isGeminiAvailable,
  BATCH_SIZE,
} from './gemini-client';

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

// ── True Crime Social Media Specialist prompt ─────────────────────────────

function buildContentPrompt(article: Article): string {
  return [
    '=== ROLE ===',
    'You are an expert True Crime Social Media Specialist for US platforms.',
    'Read the provided English news article and transform it into a high-engagement, viral Facebook post.',
    '',
    '=== TITLE FORMAT ===',
    'Bilingual format:',
    '- emojiTitle: English title with **bold emphasis** on the SINGLE MOST SHOCKING or IMPACTFUL detail from the article + relevant emoji.',
    '  The title MUST highlight the most dramatic, jaw-dropping element (e.g., the method, the motive, the victim\'s age, or a bizarre detail).',
    '  Make it irresistible to click — evoke outrage, disbelief, or morbid curiosity.',
    '- emojiTitleVi: Vietnamese translation that preserves the same shock factor with matching **bold** + same emoji.',
    'Objective: Spark curiosity and evoke outrage to drive engagement.',
    '',
    '=== MAIN CONTENT (facebookText) ===',
    '**CRITICAL: The facebookText MUST be 1700-2000 words long. This is a HARD requirement.**',
    'Structure the post in this exact order:',
    '',
    '1. THE HOOK (2-3 sentences): Immediately convey the severity and gravity of the incident. Open with the most shocking detail to stop the scroll.',
    '',
    '2. CHILLING DETAILS / FORENSIC EVIDENCE: Extract ALL specific, high-impact details from the report',
    '   (e.g., exact temperatures, specific wound patterns, GPS tracking data, bizarre suspect behavior,',
    '   destroying evidence, filming social media during the crime). Go deep — include timelines, locations, witness accounts.',
    '',
    '3. THE NARRATIVE: Rewrite the FULL news story comprehensively.',
    '   Cover every important detail, person, and event mentioned in the article.',
    '   Build tension and add a controversial angle to provoke reader outrage and drive engagement.',
    '   Include direct quotes when available. This section should be the bulk of the post.',
    '',
    '4. THE REPORTER\'S PERSPECTIVE: Include a substantial personal commentary/reflection (3-5 sentences)',
    '   to amplify the sense of tragedy or indignation felt by the community.',
    '',
    '5. LEGAL STATUS: Clearly list ALL formal charges and potential sentencing.',
    '   Provide the current custody status and scheduled date for the next court appearance.',
    '   Include any bail information, plea details, or prior criminal history if mentioned.',
    '',
    'Always end with a blank line then "👉 Thuy Phan US"',
    '',
    '=== COMMENT SECTION (commentBait) ===',
    'This comment MUST be MORE DETAILED and LONGER than the main post.',
    'Cover ALL the main details of the crime — approximately 80% of the original article.',
    '',
    'FORMAT: Split into 4-5 SHORT PARAGRAPHS separated by blank lines (\\n\\n) for easy reading.',
    'Each paragraph should focus on ONE aspect:',
    '  Paragraph 1: WHO is involved (names, ages, relationships) and WHAT happened.',
    '  Paragraph 2: Sequence of events — WHEN and WHERE it occurred, HOW it was discovered.',
    '  Paragraph 3: Key EVIDENCE cited by police/prosecutors, forensic details.',
    '  Paragraph 4: CHARGES filed, legal status, potential sentencing.',
    '  Paragraph 5: Community reaction, investigation status, or lingering questions.',
    '',
    'Write in a purely journalistic, fact-heavy reporting style. No personal opinions.',
    'Minimum 1,500 characters for the comment section.',
    'MUST end with the last line being EXACTLY: "Source: [news outlet name]"',
    '(e.g., "Source: NBC Miami" or "Source: Law & Crime"). Do NOT include a URL.',
    '',
    '=== STYLE AND WRITING RULES ===',
    'Tone: Dramatic yet professional. Use accessible American English for mass audiences.',
    'Compliance: Strategically rephrase sensitive terms to bypass Facebook community standard filters.',
    'Examples of safe rephrasing:',
    '- Instead of "killed" → "un-alived", "took their last breath", "met a tragic end"',
    '- Instead of "death" → "passing", "final moments", "tragic outcome"',
    '- Instead of "murdered" → "taken from this world", "lost their life at the hands of"',
    '- Instead of "suicide" → "took their own life", "self-harm resulting in passing"',
    '- Instead of "abuse" → "mistreatment", "harm inflicted upon"',
    '- Instead of "assault" → "violent confrontation", "physical altercation"',
    '- Instead of "rape" → "a heinous act", "violation"',
    '- Instead of "shooting" → "incident involving a firearm", "shots rang out"',
    '- Instead of "weapon/gun" → "firearm", "tool of violence"',
    '- Instead of "drugs" → "substances", "controlled materials"',
    '',
    '=== ARTICLE TO PROCESS ===',
    `Title: ${article.title}`,
    `Source: ${article.source}`,
    `URL: ${article.url}`,
    `Description: ${article.description}`,
    '',
    'Return ONLY a JSON object (no markdown fences, no preamble):',
    '{"emojiTitle":"English title with **bold** + emoji","emojiTitleVi":"Vietnamese translation with **bold** + emoji","facebookText":"structured post following the 5 sections above","commentBait":"80% key points, journalistic style, ends with Source: [source name]","summary":"3-4 paragraph factual summary","state":"US state, infer from city. Unknown if unclear"}',
  ].join('\n');
}

// ── Batch content prompt (for Gemini — multiple articles per call) ────────

function buildBatchContentPrompt(articles: Article[]): string {
  const articleBlocks = articles
    .map(
      (a, i) =>
        `--- ARTICLE ${i + 1} ---\nTitle: ${a.title}\nSource: ${a.source}\nURL: ${a.url}\nDescription: ${a.description}`,
    )
    .join('\n\n');

  return [
    '=== ROLE ===',
    'You are an expert True Crime Social Media Specialist for US platforms.',
    'Read each provided English news article and transform it into a high-engagement, viral Facebook post.',
    'Apply the SAME structure to EVERY article.',
    '',
    '=== TITLE FORMAT ===',
    'Bilingual: emojiTitle (English with **bold** emphasis on the SINGLE MOST SHOCKING detail + emoji) and emojiTitleVi (Vietnamese translation preserving the same shock factor, same **bold** + emoji).',
    'The title MUST highlight the most dramatic, jaw-dropping element to be irresistible to click.',
    '',
    '=== MAIN CONTENT (facebookText) ===',
    '**CRITICAL: Each facebookText MUST be 1700-2000 words long. This is a HARD requirement.**',
    'Structure each post in this order:',
    '1. THE HOOK: 2-3 sentences with the most shocking detail to stop the scroll.',
    '2. CHILLING DETAILS: ALL specific high-impact details (temperatures, wound patterns, GPS data, bizarre behavior, timelines, locations, witnesses).',
    '3. THE NARRATIVE: Comprehensive rewrite of the FULL story. Cover every important detail, person, event. Build tension, include quotes. This should be the bulk of the post.',
    '4. REPORTER\'S PERSPECTIVE: 3-5 sentences of personal commentary amplifying tragedy/indignation.',
    '5. LEGAL STATUS: ALL charges, sentencing, custody status, bail, plea details, criminal history.',
    'End each post with "👉 Thuy Phan US"',
    '',
    '=== COMMENT SECTION (commentBait) ===',
    'MUST be MORE DETAILED and LONGER than the main post. Cover ~80% of ALL main crime details.',
    'FORMAT: Split into 4-5 SHORT PARAGRAPHS separated by \\n\\n for easy reading.',
    'Para 1: WHO + WHAT. Para 2: WHEN + WHERE + HOW discovered. Para 3: EVIDENCE. Para 4: CHARGES + legal status. Para 5: Community reaction.',
    'Journalistic style, no personal opinions. Minimum 1,500 characters.',
    'MUST end with last line: "Source: [news outlet name]" (no URL).',
    '',
    '=== STYLE RULES ===',
    'Dramatic yet professional. Bypass FB filters: use "un-alived" not "killed", "firearm" not "gun",',
    '"substances" not "drugs", "mistreatment" not "abuse", "violent confrontation" not "assault", etc.',
    '',
    `NOW PROCESS ALL ${articles.length} ARTICLES. For each produce: emojiTitle, emojiTitleVi, facebookText, commentBait, summary, state.`,
    '',
    'ARTICLES:',
    articleBlocks,
    '',
    `Return ONLY a JSON array with ${articles.length} objects, one per article in order (no markdown fences, no preamble):`,
    '[{"emojiTitle":"...","emojiTitleVi":"...","facebookText":"...","commentBait":"...","summary":"...","state":"..."}, ...]',
  ].join('\n');
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
    `👉 Thuy Phan US`;

  const commentBait =
    `The details emerging from ${article.source} paint a disturbing picture that deserves closer examination by investigators and the public.\n\n` +
    `What triggered these events — and why did no one intervene sooner? The answer may shock you.\n\n` +
    `Follow for updates as this story develops and justice is pursued for those affected. Every victim deserves answers.\n\n` +
    `Source: ${article.url}`;

  const articleWithSummary: ArticleWithSummary = { ...article, summary: desc };
  return {
    article: articleWithSummary,
    emojiTitle,
    emojiTitleVi: '',
    facebookText,
    commentBait,
    nb2Prompt: buildNb2Prompt(article, emojiTitle),
    state: 'Unknown',
  };
}

// ── AI engine detection ───────────────────────────────────────────────────

export type AiEngine = 'gemini' | 'notebooklm' | 'fallback';

export function detectEngine(): AiEngine {
  if (isGeminiAvailable()) return 'gemini';
  return 'fallback'; // NotebookLM check is async, handled in initPipelineNotebook
}

// ── Main processor ────────────────────────────────────────────────────────

let sharedNotebookId: string | null = null;
let activeEngine: AiEngine = 'fallback';

/**
 * Initialize the pipeline. Determines which AI engine to use.
 * - Gemini API (preferred for production/Vercel)
 * - NotebookLM MCP (optional, local dev)
 * - Fallback (RSS description templates)
 */
export async function initPipelineNotebook(): Promise<string | null> {
  // Prefer Gemini
  if (isGeminiAvailable()) {
    activeEngine = 'gemini';
    console.log('[pipeline] Using Gemini API engine');
    return 'gemini'; // Return a truthy string (no real notebook ID needed)
  }

  // Try NotebookLM MCP
  try {
    const available = await isNotebookLmAvailable();
    if (available) {
      const today = new Date().toISOString().split('T')[0];
      const notebook = await createNotebook(`Crime News – ${today}`);
      sharedNotebookId = notebook.id;
      activeEngine = 'notebooklm';
      console.log(`[pipeline] Using NotebookLM engine, notebook: ${notebook.id}`);
      return notebook.id;
    }
  } catch (err) {
    console.error('[pipeline] Failed to init NotebookLM:', err);
  }

  activeEngine = 'fallback';
  console.warn('[pipeline] No AI engine available — using fallback mode');
  return null;
}

/**
 * Add an article URL to the shared notebook as a source.
 * Only used for NotebookLM engine.
 */
export async function addArticleSource(article: Article): Promise<boolean> {
  if (activeEngine !== 'notebooklm' || !sharedNotebookId) return false;
  try {
    await addUrlSource(sharedNotebookId, article.url);
    return true;
  } catch {
    console.warn(`[pipeline] Failed to add source: ${article.url}`);
    return false;
  }
}

/**
 * Ensure commentBait ends with source attribution.
 * If Gemini didn't include it, append it programmatically.
 */
function ensureSourceAttribution(commentBait: string, sourceName: string): string {
  if (!commentBait) return `Source: ${sourceName}`;
  // Check if it already ends with a Source: line
  if (/source:\s*.+/i.test(commentBait)) return commentBait;
  return `${commentBait.trimEnd()}

Source: ${sourceName}`;
}

/**
 * Parse AI response JSON into post fields.
 */
function parseAiResponse(
  raw: string,
  article: Article,
): PostDraft | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      emojiTitle: string;
      emojiTitleVi?: string;
      facebookText: string;
      commentBait: string;
      summary: string;
      state?: string;
    };

    const articleWithSummary: ArticleWithSummary = {
      ...article,
      summary: parsed.summary ?? article.description,
    };

    return {
      article: articleWithSummary,
      emojiTitle: parsed.emojiTitle,
      emojiTitleVi: parsed.emojiTitleVi ?? '',
      facebookText: parsed.facebookText,
      commentBait: ensureSourceAttribution(parsed.commentBait, article.source),
      nb2Prompt: buildNb2Prompt(article, parsed.emojiTitle),
      state: parsed.state ?? 'Unknown',
    };
  } catch {
    return null;
  }
}

/**
 * Parse a batch AI response (JSON array) into PostDraft[] paired with articles.
 */
function parseBatchAiResponse(
  raw: string,
  articles: Article[],
): (PostDraft | null)[] {
  // Find the JSON array in the response
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  if (!arrayMatch) return articles.map(() => null);

  try {
    const parsed = JSON.parse(arrayMatch[0]) as Array<{
      emojiTitle: string;
      emojiTitleVi?: string;
      facebookText: string;
      commentBait: string;
      summary: string;
      state?: string;
    }>;

    return articles.map((article, i) => {
      const item = parsed[i];
      if (!item?.emojiTitle || !item?.facebookText) return null;

      const articleWithSummary: ArticleWithSummary = {
        ...article,
        summary: item.summary ?? article.description,
      };

      return {
        article: articleWithSummary,
        emojiTitle: item.emojiTitle,
        emojiTitleVi: item.emojiTitleVi ?? '',
        facebookText: item.facebookText,
        commentBait: ensureSourceAttribution(item.commentBait, article.source),
        nb2Prompt: buildNb2Prompt(article, item.emojiTitle),
        state: item.state ?? 'Unknown',
      };
    });
  } catch {
    return articles.map(() => null);
  }
}

/**
 * Process a batch of articles with Gemini (BATCH_SIZE per API call).
 * Returns PostDraft[] in the same order as input.
 *
 * Rate budget: 25 articles ÷ 5 per batch = 5 API calls.
 * Fits within 20 RPD with room for 3 full runs/day.
 */
export async function processBatchGemini(
  articles: Article[],
  onPost: (post: PostDraft, index: number) => void,
  onProgress: (current: number, total: number, title: string) => void,
): Promise<void> {
  for (let batchStart = 0; batchStart < articles.length; batchStart += BATCH_SIZE) {
    const batch = articles.slice(batchStart, batchStart + BATCH_SIZE);
    const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(articles.length / BATCH_SIZE);

    onProgress(
      batchStart + 1,
      articles.length,
      `Gemini batch ${batchNum}/${totalBatches} (${batch.length} articles)`,
    );
    console.log(`[pipeline] Gemini batch ${batchNum}/${totalBatches}: ${batch.map((a) => a.title).join(', ')}`);

    let results: (PostDraft | null)[];
    try {
      const prompt = buildBatchContentPrompt(batch);
      const raw = await geminiGenerate(prompt);
      results = parseBatchAiResponse(raw, batch);
    } catch (err) {
      console.error(`[pipeline] Gemini batch ${batchNum} failed:`, err);
      results = batch.map(() => null);
    }

    // Emit each result (or fallback) individually
    for (let j = 0; j < batch.length; j++) {
      const globalIndex = batchStart + j;
      const post = results[j] ?? buildFallbackPost(batch[j]);
      if (!results[j]) {
        console.warn(`[pipeline] Fallback used for article ${globalIndex + 1}: ${batch[j].title}`);
      }
      onPost(post, globalIndex);
    }
  }
}

/**
 * Process a single article (NotebookLM or fallback — NOT Gemini).
 * Gemini uses processBatchGemini() instead.
 */
export async function processArticle(article: Article): Promise<PostDraft> {
  // ── NotebookLM path ──
  if (activeEngine === 'notebooklm' && sharedNotebookId) {
    try {
      const prompt = buildContentPrompt(article);
      const raw = await queryNotebook(sharedNotebookId, prompt);
      const post = parseAiResponse(raw, article);
      if (post) return post;
      console.warn(`[pipeline] NotebookLM returned unparseable response for "${article.title}", using fallback`);
    } catch (err) {
      console.error(`[pipeline] NotebookLM failed for "${article.title}":`, err);
    }
  }

  // ── Fallback ──
  return buildFallbackPost(article);
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
