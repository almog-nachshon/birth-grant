import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseEnv } from './config.ts';

/** לקוח Supabase בצד השרת. קורא ומרענן את ה-session מהעוגיות. */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // נקרא מתוך Server Component — הרענון מטופל ב-middleware
        }
      },
    },
  });
}

/**
 * לקוח עם service_role — עוקף RLS.
 * לשימוש אך ורק בנתיבי שרת מבוקרים (seed, משימות מתוזמנות).
 * לעולם לא בקוד שרץ בדפדפן.
 */
export function createAdminClient() {
  const { url } = supabaseEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('חסר SUPABASE_SERVICE_ROLE_KEY');

  return createServerClient(url, serviceKey, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
