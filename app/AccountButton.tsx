'use client';

import { useEffect, useState } from 'react';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import s from './account-button.module.css';

interface Me {
  name: string;
  avatar: string | null;
}

/**
 * כפתור החשבון בניווט הציבורי.
 *
 * נבדק בדפדפן ולא בשרת בכוונה: עמוד הבית והמחשבון הם דפים סטטיים
 * שנשלחים מה-CDN, ובדיקת session בשרת הייתה הופכת אותם לדינמיים
 * ומאטה את הדף הראשון שכל מבקר רואה.
 */
export default function AccountButton() {
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setChecked(true);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (!alive) return;
        if (data.user) {
          const meta = data.user.user_metadata ?? {};
          setMe({
            name:
              (meta.full_name as string) ??
              (meta.name as string) ??
              data.user.email?.split('@')[0] ??
              'החשבון שלי',
            avatar: (meta.avatar_url as string) ?? null,
          });
        }
      } catch {
        // אין session או שהלקוח לא נטען — מציגים את מצב האורח
      } finally {
        if (alive) setChecked(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // שומר מקום בגובה הכפתור כדי שהניווט לא יקפוץ כשהבדיקה מסתיימת
  if (!checked) return <span className={s.placeholder} aria-hidden />;

  if (!me) {
    return (
      <a href="/login" className={`btn btn-primary ${s.guest}`}>
        כניסה / הרשמה
      </a>
    );
  }

  return (
    <a href="/account" className={s.chip}>
      {me.avatar ? (
        <img src={me.avatar} alt="" className={s.avatar} />
      ) : (
        <span className={s.avatarFallback} aria-hidden>{me.name.slice(0, 1)}</span>
      )}
      <span className={s.chipName}>{me.name}</span>
      <span className={s.chipHint}>האזור האישי</span>
    </a>
  );
}
