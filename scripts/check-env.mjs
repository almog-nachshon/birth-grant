#!/usr/bin/env node
// אבחון הגדרות. בודק שהמפתחות קיימים, תקינים, ושהם באמת עובדים.
// הרצה: npm run check:env
//
// לא מדפיס אף מפתח — רק אורך וסימן זיהוי, כדי שאפשר יהיה להדביק פלט בבטחה.

import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const ENV_FILE = '.env.local';
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);

let failures = 0;
const fail = (m) => { bad(m); failures++; };

// ── טעינת הקובץ ──
console.log(`\n\x1b[1mבדיקת ${ENV_FILE}\x1b[0m`);
if (!existsSync(ENV_FILE)) {
  fail(`${ENV_FILE} לא קיים. הרץ: cp .env.example .env.local`);
  process.exit(1);
}

const env = {};
for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
}
ok(`הקובץ נטען, ${Object.keys(env).length} משתנים`);

// ── בדיקות צורה ──
console.log('\n\x1b[1mצורת המפתחות\x1b[0m');

const url = env.NEXT_PUBLIC_SUPABASE_URL;
if (!url) fail('NEXT_PUBLIC_SUPABASE_URL ריק');
else if (url.includes('xxxxxxxx')) fail('NEXT_PUBLIC_SUPABASE_URL עדיין הערך לדוגמה');
else if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) {
  fail(`NEXT_PUBLIC_SUPABASE_URL בפורמט לא צפוי: ${url}`);
} else ok(`URL תקין (${url})`);

function checkKey(name, value, { publishable = false } = {}) {
  if (!value) { fail(`${name} ריק`); return false; }
  // Supabase מנפיק היום מפתחות sb_publishable_ / sb_secret_, ובפרויקטים ותיקים JWT
  const isJwt = value.startsWith('eyJ');
  const isNew = value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
  if (!isJwt && !isNew) {
    fail(`${name} לא נראה כמו מפתח Supabase (מתחיל ב-"${value.slice(0, 6)}…")`);
    return false;
  }
  if (publishable && value.startsWith('sb_secret_')) {
    fail(`${name} הוא מפתח סודי! זה נחשף לדפדפן. צריך את המפתח הפומבי.`);
    return false;
  }
  ok(`${name} נראה תקין (${isNew ? 'פורמט חדש' : 'JWT'}, ${value.length} תווים)`);
  return true;
}

checkKey('NEXT_PUBLIC_SUPABASE_ANON_KEY', env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { publishable: true });
const hasService = checkKey('SUPABASE_SERVICE_ROLE_KEY', env.SUPABASE_SERVICE_ROLE_KEY);

// רק כששניהם מלאים — שני שדות ריקים אינם "זהים" במובן המסוכן
if (
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY === env.SUPABASE_SERVICE_ROLE_KEY
) {
  fail('המפתח הפומבי והסודי זהים — כנראה הודבק אותו מפתח פעמיים. סכנה אמיתית.');
}

const anthropic = env.ANTHROPIC_API_KEY;
if (!anthropic) warn('ANTHROPIC_API_KEY ריק — העוזר והצ\'אט לא יעבדו (השאר יעבוד)');
else if (!anthropic.startsWith('sk-ant-')) fail('ANTHROPIC_API_KEY אמור להתחיל ב-sk-ant-');
else ok(`ANTHROPIC_API_KEY נראה תקין (${anthropic.length} תווים)`);

const site = env.NEXT_PUBLIC_SITE_URL;
if (!site) warn('NEXT_PUBLIC_SITE_URL ריק — ברירת מחדל localhost:3000');
else ok(`כתובת הבסיס: ${site}`);

// ── חיבור אמיתי ──
if (failures === 0 && url) {
  console.log('\n\x1b[1mחיבור לשרת\x1b[0m');

  try {
    const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { error } = await anon.from('rates').select('key').limit(1);

    if (!error) {
      ok('המפתח הפומבי מתחבר, וטבלת rates קיימת');
    } else if (/relation .* does not exist|Could not find the table/i.test(error.message)) {
      fail('החיבור עובד אבל הטבלאות חסרות — לא הרצת את המיגרציות');
      console.log('      SQL Editor → הרץ 001_schema.sql, ואז 002_rls.sql, ואז 003_storage.sql');
    } else if (/Invalid API key|JWT/i.test(error.message)) {
      fail(`המפתח הפומבי נדחה: ${error.message}`);
    } else {
      warn(`תשובה לא צפויה: ${error.message}`);
    }
  } catch (err) {
    fail(`החיבור נכשל: ${err.message}`);
  }

  if (hasService) {
    try {
      const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });
      const TABLES = ['cases', 'case_members', 'case_persons', 'case_tasks', 'case_documents', 'catalog_tasks', 'rates'];
      const missing = [];
      for (const t of TABLES) {
        const { error } = await admin.from(t).select('*').limit(0);
        if (error) missing.push(t);
      }
      if (missing.length === 0) ok(`כל ${TABLES.length} הטבלאות קיימות`);
      else fail(`טבלאות חסרות: ${missing.join(', ')}`);

      const { count } = await admin.from('rates').select('*', { count: 'exact', head: true });
      if (count) ok(`${count} שיעורים בבסיס הנתונים`);
      else warn('טבלת rates ריקה — הרץ: npm run seed');

      const { data: published } = await admin
        .from('catalog_versions').select('semver, published_at').not('published_at', 'is', null);
      if (published?.length) ok(`קטלוג מפורסם: ${published.map((v) => v.semver).join(', ')}`);
      else warn('אין גרסת קטלוג מפורסמת — הרץ: npm run seed -- --publish');
    } catch (err) {
      fail(`בדיקת service_role נכשלה: ${err.message}`);
    }
  }
}

// ── סיכום ──
console.log('');
if (failures === 0) {
  console.log('\x1b[32mהכול תקין.\x1b[0m אחרי שינוי ב-.env.local צריך להפעיל מחדש את שרת הפיתוח.');
} else {
  console.log(`\x1b[31m${failures} בעיות.\x1b[0m תקן אותן ב-.env.local והרץ שוב.`);
  process.exit(1);
}
