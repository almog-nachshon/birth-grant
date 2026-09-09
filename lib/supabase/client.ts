'use client';

import { createBrowserClient } from '@supabase/ssr';
import { supabaseEnv } from './config.ts';

/** לקוח Supabase בדפדפן. משתמש ב-anon key בלבד — RLS הוא שכבת ההגנה. */
export function createClient() {
  const { url, key } = supabaseEnv();
  return createBrowserClient(url, key);
}
