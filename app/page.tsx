'use client';

import { useState } from 'react';
import PostCard from '@/app/components/PostCard';
import { PostDraft } from '@/app/types';

type Status = 'idle' | 'fetching' | 'summarizing' | 'formatting' | 'done' | 'error';

function StatusBar({
  status,
  articleCount,
  error,
}: {
  status: Status;
  articleCount: number;
  error: string | null;
}) {
  if (status === 'idle') return null;

  const messages: Record<Status, string> = {
    idle: '',
    fetching: '📡 Fetching 15 news feeds...',
    summarizing: '📝 Generating summaries...',
    formatting: '✨ Formatting post drafts...',
    done: `✅ ${articleCount} articles ready`,
    error: `❌ ${error ?? 'An error occurred'}`,
  };

  const isLoading = status === 'fetching' || status === 'summarizing' || status === 'formatting';
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
      <span>{messages[status]}</span>
    </div>
  );
}

export default function Home() {
  const [status, setStatus] = useState<Status>('idle');
  const [posts, setPosts] = useState<PostDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [articleCount, setArticleCount] = useState<number>(0);

  const isLoading = status !== 'idle' && status !== 'done' && status !== 'error';

  async function handleFetch() {
    setStatus('fetching');
    setError(null);
    setPosts([]);

    try {
      // Step 1: Fetch news
      const newsRes = await fetch('/api/fetch-news');
      if (!newsRes.ok) throw new Error('Failed to fetch news');
      const { articles } = await newsRes.json();
      setArticleCount(articles.length);

      // Step 2: Summarize
      setStatus('summarizing');
      const sumRes = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles }),
      });
      if (!sumRes.ok) throw new Error('Failed to summarize');
      const { articles: summarized } = await sumRes.json();

      // Step 3: Format posts
      setStatus('formatting');
      const fmtRes = await fetch('/api/format-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles: summarized }),
      });
      if (!fmtRes.ok) throw new Error('Failed to format posts');
      const { posts: formatted } = await fmtRes.json();

      setPosts(formatted);
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
          {isLoading ? 'Fetching...' : "Fetch Today's Crime News"}
        </button>
      </div>

      {/* Status bar */}
      <div className="mb-8">
        <StatusBar status={status} articleCount={articleCount} error={error} />
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
