#!/usr/bin/env node
// מילוי doc_hint ו-links בתיקים שנפתחו לפני שהקישורים נוספו לקטלוג.
// הרצה: npm run backfill:links [-- --dry-run]
//
// למה סקריפט ייעודי ולא syncCaseTasks: הסנכרון המלא רץ רק כששומרים
// פרופיל, והוא מוסיף ומוחק משימות לפי הפרופיל. כאן אין שינוי בפרופיל
// ואין סיבה לגעת בהרכב הרשימה — רק לצקת לשורות הקיימות שני שדות
// שקודם לא היו בסכמה. לכן גם אין צורך לשחזר CaseProfile לכל תיק.

import { readFileSync } from 'node:fs';
import pg from 'pg';

import { connectionString, pgOptions } from './env.mjs';

const dryRun = process.argv.includes('--dry-run');

const catalog = JSON.parse(
  readFileSync(new URL('../content/catalog.json', import.meta.url), 'utf8'),
);

// רק משימות שיש להן מה לתרום
const payload = catalog.tasks
  .filter((t) => t.doc_hint || t.links?.length)
  .map((t) => ({ key: t.key, doc_hint: t.doc_hint ?? null, links: t.links ?? [] }));

if (!payload.length) {
  console.log('אין בקטלוג משימות עם doc_hint או links. אין מה למלא.');
  process.exit(0);
}

// catalog_key בבסיס הנתונים עשוי לשאת סיומת תפקיד (hr_email:partner)
// עבור משימות role=any, ולכן ההשוואה היא מול החלק שלפני הנקודתיים.
// is_custom — משימה שהזוג הוסיף בעצמו אינה שייכת לקטלוג ולא נוגעים בה.
const STALE = `
    split_part(t.catalog_key, ':', 1) = c.key
    and t.is_custom = false
    and (t.doc_hint is distinct from c.doc_hint or t.links is distinct from c.links)`;

const RECORDSET = `jsonb_to_recordset($1::jsonb) as c(key text, doc_hint text, links jsonb)`;

const COUNT_SQL = `
  select count(*)::int n, count(distinct t.case_id)::int cases
  from public.case_tasks t
  join ${RECORDSET} on ${STALE}`;

const UPDATE_SQL = `
  update public.case_tasks t
  set doc_hint = c.doc_hint, links = c.links
  from ${RECORDSET}
  where ${STALE}`;

const params = [JSON.stringify(payload)];
const client = new pg.Client(pgOptions(connectionString()));
await client.connect();

try {
  const { rows } = await client.query(COUNT_SQL, params);
  console.log(`${payload.length} משימות בקטלוג נושאות טופס או רמז מסמך.`);
  console.log(`${rows[0].n} שורות ב-${rows[0].cases} תיקים דורשות עדכון.`);

  if (dryRun) {
    console.log('\n--dry-run — לא נכתב דבר.');
  } else if (rows[0].n > 0) {
    const { rowCount } = await client.query(UPDATE_SQL, params);
    console.log(`\n\x1b[32mעודכנו ${rowCount} שורות.\x1b[0m`);
  }
} catch (err) {
  if (err.code === '42703') {
    console.error('\x1b[31mחסרה עמודה.\x1b[0m הרץ קודם: npm run migrate -- 008');
  } else {
    console.error(`\x1b[31mנכשל:\x1b[0m ${err.message}`);
  }
  await client.end();
  process.exit(1);
}

await client.end();
