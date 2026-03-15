import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { Article } from '@/app/types';

export const dynamic = 'force-dynamic';

const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'media:content', { keepArray: true }],
      ['media:thumbnail', 'media:thumbnail'],
      ['content:encoded', 'content:encoded'],
    ],
  },
});

const FEEDS: { name: string; url: string }[] = [
  { name: 'NYT US', url: 'https://rss.nytimes.com/services/xml/rss/nyt/US.xml' },
  { name: 'CNN Crime', url: 'http://rss.cnn.com/rss/cnn_crime.rss' },
  { name: 'Fox News', url: 'https://feeds.foxnews.com/foxnews/latest' },
  { name: 'USA Today', url: 'https://www.usatoday.com/rss/news.rss' },
  { name: 'NBC News', url: 'https://feeds.nbcnews.com/nbcnews/public/news' },
  { name: 'ABC News', url: 'https://abcnews.go.com/abcnews/usheadlines' },
  { name: 'CBS News', url: 'https://www.cbsnews.com/latest/rss/us' },
  { name: 'Washington Post', url: 'https://feeds.washingtonpost.com/rss/national' },
  { name: 'AP News', url: 'https://apnews.com/rss' },
  { name: 'Law & Crime', url: 'https://lawandcrime.com/feed/' },
  { name: 'Court TV', url: 'https://www.courttv.com/feed/' },
  { name: 'Crime Online', url: 'https://www.crimeonline.com/feed/' },
  { name: 'NBC US News', url: 'https://www.nbcnews.com/rss/us-news' },
  { name: 'People Magazine', url: 'https://people.com/feed/' },
  { name: 'Courthouse News', url: 'https://www.courthousenews.com/feed/' },
];

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_ARTICLES = 20;
const MAX_ARTICLES = 25;
const IMG_SRC_REGEX_PATTERN = '<img[^>]+src="([^"]+)"';

/** Extract description from item, falling back through multiple fields. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDescription(item: any): string {
  return item.contentSnippet ?? item.summary ?? item.description ?? '';
}

/** Extract all <img src="..."> values from an HTML string. */
function extractImgSrcs(html: string | undefined): string[] {
  if (!html) return [];
  const regex = new RegExp(IMG_SRC_REGEX_PATTERN, 'gi');
  const srcs: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    srcs.push(match[1]);
  }
  return srcs;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractImages(item: any): { imageUrl?: string; portraitUrl?: string } {
  // 1. Try enclosure
  const enclosureUrl: string | undefined = item.enclosure?.url;

  // 2. Try media:content (may be an array due to keepArray: true)
  let mediaContentUrl: string | undefined;
  const mediaContent = item['media:content'];
  if (Array.isArray(mediaContent) && mediaContent.length > 0) {
    mediaContentUrl = mediaContent[0]?.$?.url ?? mediaContent[0]?.url;
  } else if (mediaContent) {
    mediaContentUrl = mediaContent?.$?.url ?? mediaContent?.url;
  }

  // 3. Parse <img> tags from content fields
  const htmlContent: string | undefined =
    item['content:encoded'] ?? item.content ?? undefined;
  const imgSrcs = extractImgSrcs(htmlContent);

  // Determine imageUrl: prefer enclosure, then media:content, then first img tag
  const imageUrl: string | undefined =
    enclosureUrl ?? mediaContentUrl ?? imgSrcs[0] ?? undefined;

  // Determine portraitUrl: a second distinct image from img tags
  let portraitUrl: string | undefined;
  for (const src of imgSrcs) {
    if (src !== imageUrl) {
      portraitUrl = src;
      break;
    }
  }

  return { imageUrl, portraitUrl };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchFeed(feed: { name: string; url: string }, filterByDate: boolean = true): Promise<Article[]> {
  const feedData = await Promise.race([
    parser.parseURL(feed.url),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Feed timeout')), 5000)),
  ]);
  const now = Date.now();
  const articles: Article[] = [];

  for (const item of feedData.items ?? []) {
    const title = (item.title ?? '').trim();
    // Skip articles without a title
    if (!title) continue;

    const pubDateStr: string =
      item.pubDate ?? item.isoDate ?? new Date(0).toISOString();
    const pubDateMs = new Date(pubDateStr).getTime();

    // Filter by 7-day window if requested
    if (filterByDate) {
      const isRecent = now - pubDateMs <= SEVEN_DAYS_MS;
      if (!isRecent) continue;
    }

    const url: string = item.link ?? item.guid ?? '';
    if (!url) continue;

    const { imageUrl, portraitUrl } = extractImages(item);

    articles.push({
      title,
      url,
      pubDate: pubDateStr,
      source: feed.name,
      description: getDescription(item),
      ...(imageUrl !== undefined && { imageUrl }),
      ...(portraitUrl !== undefined && { portraitUrl }),
    });
  }

  return articles;
}

export async function GET(): Promise<NextResponse> {
  // Fetch all feeds concurrently with date filtering, tolerating individual failures
  const results = await Promise.allSettled(
    FEEDS.map((feed) =>
      fetchFeed(feed, true).catch((err) => {
        console.error(`[fetch-news] Failed to fetch feed "${feed.name}":`, err);
        return [] as Article[];
      })
    )
  );

  let allArticles: Article[] = results.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : []
  );

  // If less than MIN_ARTICLES after 7-day filter, fetch all items again without date restriction
  if (allArticles.length < MIN_ARTICLES) {
    const unfilteredResults = await Promise.allSettled(
      FEEDS.map((feed) =>
        fetchFeed(feed, false).catch((err) => {
          console.error(`[fetch-news] Failed to fetch feed (unfiltered) "${feed.name}":`, err);
          return [] as Article[];
        })
      )
    );
    allArticles = unfilteredResults.flatMap((result) =>
      result.status === 'fulfilled' ? result.value : []
    );
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const deduplicated = allArticles.filter((article) => {
    if (seen.has(article.url)) return false;
    seen.add(article.url);
    return true;
  });

  // Sort by pubDate descending (newest first)
  deduplicated.sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  );

  // Return top MAX_ARTICLES
  const articles = deduplicated.slice(0, MAX_ARTICLES);

  return NextResponse.json({ articles });
}
