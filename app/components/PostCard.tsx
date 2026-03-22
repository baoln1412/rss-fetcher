'use client';

import { useState, useRef, useEffect } from 'react';
import { PostDraft } from '../types';

interface PostCardProps {
  post: PostDraft;
  isNew?: boolean;
  onToggleDone?: () => void;
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

function CollapsibleSection({
  label,
  text,
  defaultOpen = false,
}: {
  label: string;
  text: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <span
          className="text-xs font-semibold tracking-widest uppercase"
          style={{ color: '#f0e523' }}
        >
          {open ? '▾' : '▸'} {label}
        </span>
        <CopyButton text={text} ariaLabel={`Copy ${label.toLowerCase()}`} />
      </div>
      {open && (
        <div className="px-3 pb-3">
          {label === 'NB2 Image Prompt' ? (
            <pre
              className="text-xs text-gray-300 whitespace-pre-wrap break-words font-mono select-all"
              style={{ lineHeight: '1.5' }}
            >
              {text}
            </pre>
          ) : (
            <p
              className="text-sm text-gray-200 whitespace-pre-wrap break-words select-all"
              style={{ lineHeight: '1.6' }}
            >
              {text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Editable Facebook Draft component ─────────────────────────────────────

function EditableFacebookDraft({
  text,
  articleUrl,
  onUpdate,
}: {
  text: string;
  articleUrl: string;
  onUpdate: (newText: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(text);
  const [displayText, setDisplayText] = useState(text);
  const [saving, setSaving] = useState(false);
  const [showReprompt, setShowReprompt] = useState(false);
  const [repromptText, setRepromptText] = useState('');
  const [regenerating, setRegenerating] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/posts/update-draft', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleUrl, facebookText: editText }),
      });
      if (!res.ok) throw new Error('Save failed');
      setDisplayText(editText);
      onUpdate(editText);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save draft:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const res = await fetch('/api/posts/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleUrl, userPrompt: repromptText || undefined }),
      });
      if (!res.ok) throw new Error('Regenerate failed');
      const data = await res.json();
      if (data.facebookText) {
        setDisplayText(data.facebookText);
        setEditText(data.facebookText);
        onUpdate(data.facebookText);
        setShowReprompt(false);
        setRepromptText('');
      }
    } catch (err) {
      console.error('Failed to regenerate:', err);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <span
          className="text-xs font-semibold tracking-widest uppercase cursor-pointer select-none"
          style={{ color: '#f0e523' }}
          onClick={() => setOpen(!open)}
        >
          {open ? '▾' : '▸'} Facebook Draft
        </span>
        <div className="flex items-center gap-1">
          {!isEditing && (
            <>
              <button
                onClick={() => { setEditText(displayText); setIsEditing(true); }}
                className="text-xs px-2 py-1 rounded border transition-colors duration-150"
                style={{ borderColor: '#3b82f6', color: '#3b82f6', backgroundColor: 'transparent', cursor: 'pointer' }}
              >
                ✏️ Edit
              </button>
              <button
                onClick={() => setShowReprompt(!showReprompt)}
                className="text-xs px-2 py-1 rounded border transition-colors duration-150"
                style={{ borderColor: '#a855f7', color: '#a855f7', backgroundColor: 'transparent', cursor: 'pointer' }}
              >
                🤖 AI
              </button>
            </>
          )}
          <CopyButton text={displayText} ariaLabel="Copy facebook draft" />
        </div>
      </div>

      {/* Re-prompt bar */}
      {showReprompt && !isEditing && open && (
        <div className="px-3 pb-2 flex gap-2">
          <input
            type="text"
            placeholder="Instructions for AI (optional)..."
            value={repromptText}
            onChange={(e) => setRepromptText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !regenerating) handleRegenerate(); }}
            className="flex-1 text-xs px-2 py-1.5 rounded"
            style={{ backgroundColor: '#1a1a2e', border: '1px solid #a855f7', color: '#e2e8f0' }}
          />
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="text-xs px-3 py-1.5 rounded font-semibold transition-opacity"
            style={{
              backgroundColor: '#a855f7',
              color: '#fff',
              opacity: regenerating ? 0.6 : 1,
              cursor: regenerating ? 'wait' : 'pointer',
            }}
          >
            {regenerating ? '⏳ Generating...' : '🔄 Regenerate'}
          </button>
        </div>
      )}

      {/* Content */}
      {open && (
        <div className="px-3 pb-3">
          {isEditing ? (
            <>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full text-sm text-gray-200 rounded p-2"
                style={{
                  backgroundColor: '#1a1a2e',
                  border: '1px solid #3b82f6',
                  lineHeight: '1.6',
                  minHeight: '300px',
                  resize: 'vertical',
                  color: '#e2e8f0',
                }}
                rows={15}
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="text-xs px-3 py-1.5 rounded font-semibold"
                  style={{
                    backgroundColor: '#22c55e',
                    color: '#000',
                    opacity: saving ? 0.6 : 1,
                    cursor: saving ? 'wait' : 'pointer',
                  }}
                >
                  {saving ? 'Saving...' : '💾 Save'}
                </button>
                <button
                  onClick={() => { setIsEditing(false); setEditText(displayText); }}
                  className="text-xs px-3 py-1.5 rounded font-semibold"
                  style={{ backgroundColor: '#333', color: '#ccc', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <p
              className="text-sm text-gray-200 whitespace-pre-wrap break-words select-all"
              style={{ lineHeight: '1.6' }}
            >
              {displayText}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Render **bold** markdown in title strings
function renderBoldMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: '#f0e523' }}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export default function PostCard({ post, isNew, onToggleDone }: PostCardProps) {
  const { article, facebookText, nb2Prompt, emojiTitle, emojiTitleVi, commentBait, state } = post;
  const { title, pubDate, source, imageUrl, portraitUrl, url } = article;
  const isDone = post.isDone ?? false;

  const [portraitVisible, setPortraitVisible] = useState(true);

  // Format dates in UTC+7 (Asia/Bangkok)
  const tzOptions: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Bangkok' };

  let formattedDate = '';
  try {
    if (pubDate) {
      formattedDate = new Date(pubDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        ...tzOptions,
      });
    }
  } catch (err) {
    console.error('Failed to parse date:', err);
  }

  let formattedFetchTime = '';
  try {
    const ft = post.fetchTime;
    if (ft) {
      const d = new Date(ft);
      formattedFetchTime = d.toLocaleString('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        ...tzOptions,
      }).replace(',', '');
    }
  } catch (err) {
    console.error('Failed to parse fetch_time:', err);
  }

  return (
    <div
      className="rounded-xl overflow-hidden border transition-opacity duration-200"
      style={{
        backgroundColor: '#1a1a1a',
        borderColor: isDone ? '#22c55e' : '#333',
        opacity: isDone ? 0.6 : 1,
      }}
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
        {/* Source + date + link */}
        <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-sm text-white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
          <div>
            <span className="font-semibold">{source}</span>
            {state && state !== 'Unknown' && (
              <>
                <span className="mx-1 opacity-70">•</span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                  style={{
                    backgroundColor: 'rgba(240,229,35,0.2)',
                    color: '#f0e523',
                  }}
                >
                  📍 {state}
                </span>
              </>
            )}
            <span className="mx-1 opacity-70">•</span>
            <span className="opacity-80">{formattedDate}</span>
            {formattedFetchTime && (
              <>
                <span className="mx-1 opacity-70">•</span>
                <span className="opacity-60 text-xs">Fetched: {formattedFetchTime}</span>
              </>
            )}
            {isNew && (
              <span
                className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full animate-pulse"
                style={{
                  backgroundColor: '#f0e523',
                  color: '#000000',
                }}
              >
                🆕 NEW
              </span>
            )}
          </div>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-2 py-1 rounded transition-colors duration-150"
            style={{
              backgroundColor: 'rgba(240,229,35,0.15)',
              color: '#f0e523',
              border: '1px solid rgba(240,229,35,0.3)',
            }}
          >
            Source ↗
          </a>
        </div>
      </div>

      {/* Card body */}
      <div className="p-4 flex flex-col gap-3">
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
          <div style={{ flex: 1 }}>
            <h2 className="text-xl font-bold text-white leading-snug">
              {renderBoldMarkdown(emojiTitle)}
            </h2>
            {emojiTitleVi && (
              <p className="text-sm mt-1 leading-snug" style={{ color: '#9ca3af' }}>
                ({renderBoldMarkdown(emojiTitleVi)})
              </p>
            )}
          </div>
        </div>

        {/* Original article title (smaller, for reference) */}
        <p className="text-xs opacity-50 text-gray-400 truncate" title={title}>
          Original: {title}
        </p>

        {/* Facebook Draft — Editable + AI Re-prompt */}
        <EditableFacebookDraft
          text={facebookText}
          articleUrl={url}
          onUpdate={(newText) => {
            // Update the local post object so UI reflects changes immediately
            post.facebookText = newText;
          }}
        />
        <CollapsibleSection label="Comment Bait" text={commentBait} />
        <CollapsibleSection label="NB2 Image Prompt" text={nb2Prompt} />

        {/* Done toggle button */}
        {onToggleDone && (
          <button
            onClick={onToggleDone}
            className="w-full mt-2 py-2 rounded-lg text-sm font-semibold transition-colors duration-150"
            style={{
              backgroundColor: isDone ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)',
              color: isDone ? '#22c55e' : '#94a3b8',
              border: `1px solid ${isDone ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.3)'}`,
              cursor: 'pointer',
            }}
          >
            {isDone ? '✅ Done' : '☐ Mark Done'}
          </button>
        )}
      </div>
    </div>
  );
}
