/**
 * PATCH /api/posts/update-draft — Save a manually edited Facebook draft.
 *
 * Body: { articleUrl: string, facebookText: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/app/lib/supabase';

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const { articleUrl, facebookText } = await request.json();

    if (!articleUrl || typeof facebookText !== 'string') {
      return NextResponse.json(
        { error: 'articleUrl (string) and facebookText (string) are required' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseServer();
    const { error } = await supabase
      .from('crime_posts')
      .update({ facebook_text: facebookText })
      .eq('article_url', articleUrl);

    if (error) {
      console.error('[update-draft] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[update-draft] Error:', err);
    return NextResponse.json({ error: 'Failed to update draft' }, { status: 500 });
  }
}
