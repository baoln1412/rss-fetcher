export interface Article {
  title: string;
  url: string;
  pubDate: string;
  source: string;        // e.g. "CNN Crime"
  description: string;   // RSS description/snippet
  imageUrl?: string;     // og:image or first image from feed
  portraitUrl?: string;  // second image or face image from article
}

export interface ArticleWithSummary extends Article {
  summary: string;       // 3-4 paragraphs from NotebookLM or RSS description
}

export interface PostDraft {
  article: ArticleWithSummary;
  facebookText: string;  // full Facebook post draft
  nb2Prompt: string;     // Nano Banana 2 image generation prompt
  emojiTitle: string;    // <=16 word title with emoji
}
