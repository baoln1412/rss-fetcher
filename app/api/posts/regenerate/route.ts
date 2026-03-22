/**
 * POST /api/posts/regenerate — Re-generate the Facebook draft for a post using Gemini.
 *
 * Body: { articleUrl: string, userPrompt?: string }
 * The userPrompt is an optional instruction the user can give to guide the regeneration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/app/lib/supabase';
import {
  generateContent as geminiGenerate,
  isAvailable as isGeminiAvailable,
} from '@/app/api/pipeline/gemini-client';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!isGeminiAvailable()) {
      return NextResponse.json({ error: 'Gemini API not available' }, { status: 503 });
    }

    const { articleUrl, userPrompt } = await request.json();

    if (!articleUrl) {
      return NextResponse.json({ error: 'articleUrl is required' }, { status: 400 });
    }

    // Fetch the existing post from DB
    const supabase = getSupabaseServer();
    const { data: row, error: fetchErr } = await supabase
      .from('crime_posts')
      .select('*')
      .eq('article_url', articleUrl)
      .single();

    if (fetchErr || !row) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Build the re-prompt
    const prompt = [
      '=== ROLE ===',
      'You are an expert True Crime Social Media Specialist for US platforms.',
      'You previously wrote a Facebook post for a crime news article. The user wants you to rewrite it.',
      '',
      '=== ORIGINAL ARTICLE ===',
      `Title: ${row.article_title}`,
      `Source: ${row.source}`,
      `URL: ${row.article_url}`,
      `Description: ${row.description ?? ''}`,
      '',
      '=== CURRENT FACEBOOK DRAFT ===',
      row.facebook_text,
      '',
      `=== USER INSTRUCTIONS ===`,
      userPrompt
        ? `The user wants these specific changes: "${userPrompt}"`
        : 'The user wants a fresh rewrite. Make it more engaging, dramatic, and detailed.',
      '',
      '=== REQUIREMENTS ===',
      '**CRITICAL: The new facebookText MUST be 1700-2000 words long.**',
      'Keep the same 5-section structure: Hook → Chilling Details → Narrative → Reporter\'s Perspective → Legal Status.',
      'End with "👉 Thuy Phan US".',
      '',
      '=== STYLE RULES ===',
      'Dramatic yet professional. Bypass FB filters: use "un-alived" not "killed", "firearm" not "gun",',
      '"substances" not "drugs", "mistreatment" not "abuse", "violent confrontation" not "assault", etc.',
      '',
      'Return ONLY a JSON object (no markdown fences, no preamble):',
      '{"facebookText":"the rewritten post"}',
    ].join('\n');

    const raw = await geminiGenerate(prompt);

    // Parse the response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]) as { facebookText: string };
    if (!parsed.facebookText) {
      return NextResponse.json({ error: 'AI returned empty facebookText' }, { status: 500 });
    }

    // Return preview only — user must accept before saving
    return NextResponse.json({ success: true, facebookText: parsed.facebookText });
  } catch (err) {
    console.error('[regenerate] Error:', err);
    return NextResponse.json({ error: 'Failed to regenerate draft' }, { status: 500 });
  }
}
