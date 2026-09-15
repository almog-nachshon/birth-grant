// טעינת .env.local ובניית מחרוזת החיבור. משותף לסקריפטים שניגשים
// ישירות ל-Postgres — כדי שהפינות של supabase/pg יטופלו במקום אחד.

import { readFileSync, existsSync } from 'node:fs';

export function loadEnv() {
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
  return env;
}

/**
 * חיבור ישיר ולא דרך ה-pooler: DDL לא עובד טוב מול pgbouncer.
 * pg v8.16+ מפרש sslmode=require כ-verify-full, ותעודות Supabase חתומות
 * בשורש עצמי — מסירים את הפרמטר ומגדירים SSL מפורשות ב-pgOptions.
 */
export function connectionString(env = loadEnv()) {
  const conn = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL;
  if (!conn) {
    console.error('חסרה מחרוזת חיבור (POSTGRES_URL_NON_POOLING) ב-.env.local');
    process.exit(1);
  }
  return conn.replace(/[?&]sslmode=[^&]*/g, (m) => (m[0] === '?' ? '?' : '')).replace(/\?$/, '');
}

export const pgOptions = (conn) => ({ connectionString: conn, ssl: { rejectUnauthorized: false } });
