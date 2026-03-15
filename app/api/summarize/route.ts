import { NextRequest, NextResponse } from 'next/server';
import { Article, ArticleWithSummary } from '@/app/types';

function buildFallbackSummary(article: Article): string {
  const { description, source } = article;

  if (!description) {
    return `A developing story from ${source} that demands your attention.`;
  }

  return `"${description}"

This developing story from ${source} raises critical questions about public safety and the justice system. The details surrounding this case continue to shock the community and demand answers.

Stay tuned for updates as this story unfolds.`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const articles: Article[] = body.articles ?? [];

  // NotebookLM MCP integration point — configure MCP server to enable
  const articlesWithSummary: ArticleWithSummary[] = articles.map((article) => {
    const summary = buildFallbackSummary(article);
    return { ...article, summary };
  });

  return NextResponse.json({ articles: articlesWithSummary });
}
