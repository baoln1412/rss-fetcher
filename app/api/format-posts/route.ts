import { NextRequest, NextResponse } from 'next/server';
import { ArticleWithSummary, PostDraft } from '@/app/types';

const PAGE_NAME = 'Crime News Daily';

function pickEmoji(title: string): string {
  const lower = title.toLowerCase();
  if (/murder|kill|dead|death/.test(lower)) return '💀';
  if (/arrest|police|cop/.test(lower)) return '🚔';
  if (/court|trial|judge|verdict/.test(lower)) return '⚖️';
  if (/gun|shoot|shot/.test(lower)) return '🔫';
  if (/missing|abduct|kidnap/.test(lower)) return '🔍';
  if (/explosion|bomb/.test(lower)) return '🧨';
  return '🚨';
}

function buildEmojiTitle(article: ArticleWithSummary): string {
  const emoji = pickEmoji(article.title);
  const words = article.title.trim().split(/\s+/);
  const truncated = words.slice(0, 16).join(' ');
  return `${emoji} ${truncated}`;
}

function pickControversyHook(title: string): string {
  const lower = title.toLowerCase();
  if (/court|trial|judge|verdict|justice|law/.test(lower)) {
    return "What the mainstream media won't tell you: this case exposes deep cracks in our justice system.";
  }
  if (/police|cop|arrest|system|fail/.test(lower)) {
    return "But here's what no one is talking about: the system that was supposed to protect us may have failed again.";
  }
  return "The question everyone is asking: how did this happen, and who is responsible?";
}

function extractParagraphs(summary: string): string[] {
  // Split on double newline first
  const byDoubleNewline = summary
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (byDoubleNewline.length >= 2) return byDoubleNewline;

  // Fall back: split on sentence boundaries (groups of ~2 sentences)
  const sentences = summary.match(/[^.!?]+[.!?]+/g) ?? [summary];
  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    paragraphs.push(sentences.slice(i, i + 2).join(' ').trim());
  }
  return paragraphs.filter(Boolean);
}

function buildFacebookText(
  article: ArticleWithSummary,
  emojiTitle: string,
): string {
  const paragraphs = extractParagraphs(article.summary);

  const p1 = paragraphs[0] ?? article.description ?? 'A developing story that demands your attention.';
  const p2 = paragraphs[1] ?? paragraphs[0] ?? 'The details surrounding this case continue to shock the community and demand answers.';
  const p3 = pickControversyHook(article.title);
  const p4 = `Follow ${PAGE_NAME} for breaking crime news updates. Share this story if you believe justice must be served. 👇`;

  return `${emojiTitle}\n\n${p1}\n\n${p2}\n\n${p3}\n\n${p4}`;
}

function buildNb2Prompt(
  article: ArticleWithSummary,
  emojiTitle: string,
): string {
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const articles: ArticleWithSummary[] = body.articles ?? [];

  const posts: PostDraft[] = articles.map((article) => {
    const emojiTitle = buildEmojiTitle(article);
    const facebookText = buildFacebookText(article, emojiTitle);
    const nb2Prompt = buildNb2Prompt(article, emojiTitle);

    return { article, emojiTitle, facebookText, nb2Prompt };
  });

  return NextResponse.json({ posts });
}
