'use client';

import { useState } from 'react';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import s from './login.module.css';

export default function LoginPage() {
  const configured = isSupabaseConfigured();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'working' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const nextPath =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('next') || '/case'
      : '/case';

  async function signInWithGoogle() {
    setStatus('working');
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });
      if (error) throw error;
      // הדפדפן מנווט ל-Google מכאן
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'ההתחברות נכשלה');
    }
  }

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setStatus('working');
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });
      if (error) throw error;
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'שליחת הקישור נכשלה');
    }
  }

  return (
    <main className={s.page}>
      <div className={s.card}>
        <a href="/" className={s.back}>← לעמוד הבית</a>

        <h1 className={s.title}>כניסה לתיק שלכם</h1>
        <p className={s.sub}>
          חשבון אחד לכל זוג. אחרי הכניסה אפשר להזמין את בן/בת הזוג לאותו תיק.
        </p>

        {!configured ? (
          <div className={s.notice}>
            <strong>ההתחברות עדיין לא מוגדרת.</strong>
            <p>
              צריך פרויקט Supabase ומפתחות ב-<code>.env.local</code>. השלבים המדויקים
              נמצאים ב-README, בפרק "הקמה".
            </p>
          </div>
        ) : status === 'sent' ? (
          <div className={s.notice}>
            <strong>שלחנו קישור ל-{email}</strong>
            <p>הקישור תקף לשעה. אם לא הגיע — כדאי לבדוק בספאם.</p>
          </div>
        ) : (
          <>
            <button
              onClick={signInWithGoogle}
              disabled={status === 'working'}
              className={`btn btn-google ${s.full}`}
            >
              <GoogleIcon />
              המשך עם Google
            </button>

            <div className={s.divider}><span>או</span></div>

            <form onSubmit={signInWithEmail} className={s.form}>
              <label className={s.label} htmlFor="email">כתובת מייל</label>
              <input
                id="email"
                type="email"
                required
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={s.input}
              />
              <button
                type="submit"
                disabled={status === 'working' || !email}
                className={`btn btn-ghost ${s.full}`}
              >
                {status === 'working' ? 'רגע…' : 'שליחת קישור כניסה'}
              </button>
            </form>

            {status === 'error' && <p className={s.error}>{message}</p>}
          </>
        )}

        <p className={s.legal}>
          בכניסה אתם מאשרים את <a href="/terms">תנאי השימוש</a> ואת{' '}
          <a href="/privacy">מדיניות הפרטיות</a>. לא נבקש מכם תעודת זהות או פרטי בנק.
        </p>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 01-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0012 24z" />
      <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 010-4.6V6.6H1.4a12 12 0 000 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 001.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  );
}
