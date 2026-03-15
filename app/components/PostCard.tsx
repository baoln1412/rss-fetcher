'use client';

import { useState, useRef, useEffect } from 'react';
import { PostDraft } from '../types';

interface PostCardProps {
  post: PostDraft;
}

function CopyButton({ text, ariaLabel }: { text: string; ariaLabel?: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <button
      onClick={handleCopy}
      aria-label={ariaLabel}
      className="text-xs px-2 py-1 rounded border transition-colors duration-150"
      style={{
        borderColor: '#f0e523',
        color: copied ? '#1a1a1a' : '#f0e523',
        backgroundColor: copied ? '#f0e523' : 'transparent',
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export default function PostCard({ post }: PostCardProps) {
  const { article, facebookText, nb2Prompt, emojiTitle } = post;
  const { title, pubDate, source, imageUrl, portraitUrl } = article;

  const [portraitVisible, setPortraitVisible] = useState(true);

  let formattedDate = '';
  try {
    if (pubDate) {
      formattedDate = new Date(pubDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
  } catch (err) {
    console.error('Failed to parse date:', err);
  }

  return (
    <div
      className="rounded-xl overflow-hidden border"
      style={{ backgroundColor: '#1a1a1a', borderColor: '#333' }}
    >
      {/* Background image header */}
      <div
        className="relative w-full"
        style={{ height: '200px' }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
            backgroundColor: '#1a1a1a',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        {/* Dark overlay */}
        <div
          className="absolute inset-0"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)' }}
        />
        {/* Source + date */}
        <div className="absolute bottom-3 left-4 text-sm text-white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
          <span className="font-semibold">{source}</span>
          <span className="mx-1 opacity-70">•</span>
          <span className="opacity-80">{formattedDate}</span>
        </div>
      </div>

      {/* Card body */}
      <div className="p-4 flex flex-col gap-4">
        {/* Portrait + title row */}
        <div className="flex items-start gap-3">
          {portraitUrl && portraitVisible && (
            <img
              src={portraitUrl}
              alt={`Portrait from ${source}`}
              width={60}
              height={60}
              onError={() => setPortraitVisible(false)}
              style={{
                borderRadius: '50%',
                border: '3px solid #f0e523',
                objectFit: 'cover',
                flexShrink: 0,
                width: '60px',
                height: '60px',
              }}
            />
          )}
          <h2
            className="text-xl font-bold text-white leading-snug"
            style={{ flex: 1 }}
          >
            {emojiTitle}
          </h2>
        </div>

        {/* NB2 Prompt section */}
        <div
          className="rounded-lg p-3"
          style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-xs font-semibold tracking-widest uppercase"
              style={{ color: '#f0e523' }}
            >
              NB2 Image Prompt
            </span>
            <CopyButton text={nb2Prompt} ariaLabel="Copy NB2 prompt" />
          </div>
          <pre
            className="text-xs text-gray-300 whitespace-pre-wrap break-words font-mono select-all"
            style={{ lineHeight: '1.5' }}
          >
            {nb2Prompt}
          </pre>
        </div>

        {/* Facebook Draft section */}
        <div
          className="rounded-lg p-3"
          style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-xs font-semibold tracking-widest uppercase"
              style={{ color: '#f0e523' }}
            >
              Facebook Draft
            </span>
            <CopyButton text={facebookText} ariaLabel="Copy Facebook draft" />
          </div>
          <p
            className="text-sm text-gray-200 whitespace-pre-wrap break-words select-all"
            style={{ lineHeight: '1.6' }}
          >
            {facebookText}
          </p>
        </div>
      </div>
    </div>
  );
}
