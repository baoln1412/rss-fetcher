'use client';

import { useState } from 'react';
import PostCard from '@/app/components/PostCard';
import { PostDraft } from '@/app/types';

type Status = 'idle' | 'fetching' | 'processing' | 'done' | 'error';

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
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      <span>{message}</span>
    </div>
  );
}

export default function Home() {
  const [status, setStatus] = useState<Status>('idle');
  const [posts, setPosts] = useState<PostDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [articleCount, setArticleCount] = useState<number>(0);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const isLoading = status === 'fetching' || status === 'processing';

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

      // Step 2: stream posts via SSE pipeline
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

        // Process complete SSE lines — keep incomplete last line in buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

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
            // malformed event — skip
          }
        }
      }

      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStatus('error');
    }
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight mb-2" style={{ color: '#ffffff' }}>
          🔴 CRIME NEWS DRAFT TOOL
        </h1>
        <p className="text-base" style={{ color: '#9ca3af' }}>
          Generate Facebook post drafts from today&apos;s crime headlines
        </p>
      </div>

      {/* Fetch button */}
      <div className="mb-6">
        <button
          onClick={handleFetch}
          disabled={isLoading}
          className="font-bold px-6 py-3 rounded-lg transition-opacity duration-150 text-sm"
          style={{
            backgroundColor: '#f0e523',
            color: '#000000',
            opacity: isLoading ? 0.6 : 1,
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
        >
          {isLoading ? 'Processing...' : "Fetch Today's Crime News"}
        </button>
      </div>

      {/* Status bar */}
      <div className="mb-8">
        <StatusBar
          status={status}
          articleCount={articleCount}
          progress={progress}
          error={error}
        />
      </div>

      {/* Post cards grid */}
      {posts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {posts.map((post, index) => (
            <PostCard key={`${post.article.url}-${index}`} post={post} />
          ))}
        </div>
      )}
    </main>
  );
}
