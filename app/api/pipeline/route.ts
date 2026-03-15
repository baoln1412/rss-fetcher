import { NextRequest } from 'next/server';
import { Article } from '@/app/types';
import {
  initPipelineNotebook,
  addArticleSource,
  processArticle,
  buildFallbackPost,
  cleanupPipelineNotebook,
} from './article-processor';

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

      // Step 1: Initialize the shared NotebookLM notebook
      emit({ type: 'progress', current: 0, total: articles.length, title: 'Initializing NotebookLM...' });
      const notebookId = await initPipelineNotebook();

      if (notebookId) {
        // Step 2: Add all article URLs as sources (batch)
        emit({ type: 'progress', current: 0, total: articles.length, title: 'Adding article sources...' });
        for (const article of articles) {
          await addArticleSource(article);
        }
      }

      // Step 3: Process each article
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

      // Step 4: Cleanup
      await cleanupPipelineNotebook();

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
