import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from './config.ts';

/**
 * מחזיר תשובת 503 ברורה כשהשרת עדיין לא הוגדר, במקום 500 סתמי.
 * null = הכול תקין, אפשר להמשיך.
 */
export function notConfigured(): NextResponse | null {
  if (isSupabaseConfigured()) return null;
  return NextResponse.json(
    { error: 'השרת עדיין לא הוגדר — חסרים מפתחות Supabase' },
    { status: 503 },
  );
}
