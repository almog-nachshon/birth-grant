#!/usr/bin/env node
// מריץ את המיגרציות לפי הסדר, כל אחת בטרנזקציה.
// הרצה: npm run migrate
//
// עדיף על העתקה ידנית ל-SQL Editor: הסדר נאכף, שגיאה עוצרת מיד,
// וכישלון באמצע קובץ מתגלגל אחורה במקום להשאיר סכמה חצי-בנויה.

import { readFileSync, existsSync } from 'node:fs';
import pg from 'pg';

if (!existsSync('.env.local')) {
  console.error('.env.local לא קיים');
  process.exit(1);
}

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq === -1) continue;
  env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
}

// חיבור ישיר ולא דרך ה-pooler: DDL לא עובד טוב מול pgbouncer
let conn = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL;
if (!conn) {
  console.error('חסרה מחרוזת חיבור (POSTGRES_URL_NON_POOLING) ב-.env.local');
  process.exit(1);
}

// pg v8.16+ מפרש sslmode=require כ-verify-full, ותעודות Supabase חתומות
// בשורש עצמי. מסירים את הפרמטר ומגדירים SSL מפורשות למטה.
conn = conn.replace(/[?&]sslmode=[^&]*/g, (m) => (m[0] === '?' ? '?' : '')).replace(/\?$/, '');

const ALL = [
  'supabase/migrations/001_schema.sql',
  'supabase/migrations/002_rls.sql',
  'supabase/migrations/003_storage.sql',
  'supabase/migrations/004_profile_inputs.sql',
  'supabase/migrations/005_profile_contact.sql',
];

// הרצה חלקית: npm run migrate -- 004
// 001–003 אינם אידמפוטנטיים, ועל בסיס נתונים שכבר הוקם צריך להריץ
// רק את המיגרציה החדשה.
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const FILES = only.length
  ? ALL.filter((f) => only.some((arg) => f.includes(arg)))
  : ALL;

if (!FILES.length) {
  console.error(`לא נמצאה מיגרציה שתואמת ל-${only.join(', ')}`);
  process.exit(1);
}

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const { rows } = await client.query('select current_database() db, version() v');
  console.log(`מחובר ל-${rows[0].db}\n`);
} catch (err) {
  console.error(`החיבור נכשל: ${err.message}`);
  process.exit(1);
}

let failed = false;
for (const file of FILES) {
  const sql = readFileSync(file, 'utf8');
  process.stdout.write(`${file.split('/').pop()} … `);
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
    console.log('\x1b[32mהצליח\x1b[0m');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    console.log('\x1b[31mנכשל\x1b[0m');
    console.error(`\n  ${err.message}`);
    if (err.hint) console.error(`  רמז: ${err.hint}`);
    if (err.position) {
      // מציג את השורה שנכשלה, כדי שלא צריך לספור תווים
      const upto = sql.slice(0, Number(err.position));
      const lineNo = upto.split('\n').length;
      console.error(`  בשורה ${lineNo}: ${sql.split('\n')[lineNo - 1]?.trim()}`);
    }
    failed = true;
    break; // הקבצים תלויים זה בזה — אין טעם להמשיך
  }
}

// ── סיכום מצב הסכמה ──
if (!failed) {
  const { rows } = await client.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `);
  const { rows: pol } = await client.query(`select count(*)::int n from pg_policies where schemaname = 'public'`);
  const { rows: buckets } = await client.query(`select id from storage.buckets`);

  console.log(`\n\x1b[32mהושלם.\x1b[0m`);
  console.log(`  טבלאות: ${rows.length} (${rows.map((r) => r.table_name).join(', ')})`);
  console.log(`  מדיניות RLS: ${pol[0].n}`);
  console.log(`  דליי אחסון: ${buckets.map((b) => b.id).join(', ') || 'אין'}`);
}

await client.end();
process.exit(failed ? 1 : 0);
