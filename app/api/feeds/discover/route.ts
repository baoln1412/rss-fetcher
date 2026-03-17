/**
 * /api/feeds/discover — Auto-discover RSS feed URLs from a website.
 *
 * POST { url: "https://example.com" }
 * Returns { feeds: [{ url, title?, type }] }
 *
 * Strategy:
 *  1. Fetch the page HTML and look for <link rel="alternate" type="application/rss+xml|atom+xml">
 *  2. Try common feed URL patterns (/feed/, /rss/, /feed.xml, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Common RSS feed path patterns to probe
const COMMON_FEED_PATHS = [
  '/feed/',
  '/feed',
  '/rss/',
  '/rss',
  '/feed.xml',
  '/rss.xml',
  '/atom.xml',
  '/index.xml',
  '/feeds/posts/default',      // Blogger
  '/?feed=rss2',               // WordPress
];

interface DiscoveredFeed {
  url: string;
  title?: string;
  type: 'html-link' | 'probe';
}

/** Extract RSS/Atom feed links from HTML <head>. */
function extractFeedLinks(html: string, baseUrl: string): DiscoveredFeed[] {
  const feeds: DiscoveredFeed[] = [];
  // Match <link> tags with type="application/rss+xml" or "application/atom+xml"
  const linkRegex = /<link[^>]*type=["'](application\/(?:rss|atom)\+xml)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const tag = match[0];
    // Extract href
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;

    let href = hrefMatch[1];
    // Resolve relative URLs
    if (href.startsWith('/')) {
      const url = new URL(baseUrl);
      href = `${url.protocol}//${url.host}${href}`;
    } else if (!href.startsWith('http')) {
      href = `${baseUrl.replace(/\/$/, '')}/${href}`;
    }

    // Extract title if present
    const titleMatch = tag.match(/title=["']([^"']+)["']/i);
    feeds.push({
      url: href,
      title: titleMatch?.[1],
      type: 'html-link',
    });
  }

  return feeds;
}

/** Check if a URL returns a valid RSS/Atom feed. */
async function probeFeedUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'RSS-Feed-Discoverer/1.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const contentType = res.headers.get('content-type') ?? '';
    const text = await res.text();
    // Check content type or body for RSS/Atom markers
    return (
      contentType.includes('xml') ||
      contentType.includes('rss') ||
      contentType.includes('atom') ||
      text.includes('<rss') ||
      text.includes('<feed') ||
      text.includes('<channel')
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    let { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    url = url.trim();
    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }

    const discovered: DiscoveredFeed[] = [];

    // ── Step 1: Check if the URL itself is already an RSS feed ──
    const isDirectFeed = await probeFeedUrl(url);
    if (isDirectFeed) {
      discovered.push({ url, title: 'Direct feed', type: 'probe' });
      return NextResponse.json({ feeds: discovered });
    }

    // ── Step 2: Fetch HTML and look for <link> tags ──
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'RSS-Feed-Discoverer/1.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const html = await res.text();
        const htmlFeeds = extractFeedLinks(html, url);
        discovered.push(...htmlFeeds);
      }
    } catch (err) {
      console.warn('[discover] Failed to fetch page HTML:', err);
    }

    // ── Step 3: Probe common feed paths ──
    const baseUrl = new URL(url);
    const probeBase = `${baseUrl.protocol}//${baseUrl.host}`;

    const probeResults = await Promise.allSettled(
      COMMON_FEED_PATHS.map(async (path) => {
        const feedUrl = `${probeBase}${path}`;
        // Skip if already discovered via HTML
        if (discovered.some((d) => d.url === feedUrl)) return null;
        const isValid = await probeFeedUrl(feedUrl);
        return isValid ? feedUrl : null;
      })
    );

    for (const result of probeResults) {
      if (result.status === 'fulfilled' && result.value) {
        discovered.push({ url: result.value, type: 'probe' });
      }
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    const unique = discovered.filter((f) => {
      if (seen.has(f.url)) return false;
      seen.add(f.url);
      return true;
    });

    return NextResponse.json({ feeds: unique });
  } catch (err) {
    console.error('[discover] Error:', err);
    return NextResponse.json({ error: 'Failed to discover feeds' }, { status: 500 });
  }
}
