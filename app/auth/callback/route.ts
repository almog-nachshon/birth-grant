import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * יעד ה-redirect מ-Google ומקישורי המייל.
 * ממיר את הקוד ל-session, ואז מנתב לפי מצב התיק.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/case';
  const authError = searchParams.get('error_description');

  if (authError) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(authError)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  // מזמין שהגיע דרך קישור הזמנה — מממשים לפני הניתוב
  const inviteToken = searchParams.get('invite');
  if (inviteToken) {
    await supabase.rpc('redeem_invite', { raw_token: inviteToken });
  }

  // אין עדיין תיק — לשאלון. יש — למסך התיק.
  const { data: membership } = await supabase.from('case_members').select('case_id').limit(1);
  const destination = membership && membership.length > 0 ? next : '/onboarding';

  return NextResponse.redirect(`${origin}${destination}`);
}
