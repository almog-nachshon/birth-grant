#!/usr/bin/env node
// טעינת הקטלוג וטבלת השיעורים לבסיס הנתונים.
// הרצה: node scripts/seed.mjs [--publish]
//
// ה-JSON הוא מקור האמת ונשמר ב-git. הטבלאות בבסיס הנתונים משרתות
// את מדיניות הקריאה הציבורית ואת עורך הקטלוג העתידי.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('חסרים NEXT_PUBLIC_SUPABASE_URL או SUPABASE_SERVICE_ROLE_KEY.');
  console.error('טען אותם מ-.env.local לפני ההרצה.');
  process.exit(1);
}

const publish = process.argv.includes('--publish');
const supabase = createClient(url, key, { auth: { persistSession: false } });

const catalog = JSON.parse(readFileSync(new URL('../content/catalog.json', import.meta.url), 'utf8'));
const ratesDoc = JSON.parse(readFileSync(new URL('../content/rates.json', import.meta.url), 'utf8'));

function die(step, error) {
  console.error(`✗ ${step}: ${error.message}`);
  process.exit(1);
}

// ── שיעורים ──
{
  const rows = ratesDoc.rates.map((r) => ({
    key: r.key,
    value: r.value,
    unit: r.unit,
    label: r.label ?? null,
    scope: r.scope ?? null,
    confidence: r.confidence ?? null,
    effective_from: r.effective_from,
    effective_to: r.effective_to ?? null,
  }));
  const { error } = await supabase
    .from('rates')
    .upsert(rows, { onConflict: 'key,scope,effective_from' });
  if (error) die('טעינת שיעורים', error);
  console.log(`✓ ${rows.length} שיעורים`);
}

// ── גרסת קטלוג ──
const { data: version, error: vErr } = await supabase
  .from('catalog_versions')
  .upsert(
    {
      semver: catalog.version,
      notes: `נטען מ-content/catalog.json`,
      published_at: publish ? new Date().toISOString() : null,
    },
    { onConflict: 'semver' },
  )
  .select('id, semver, published_at')
  .single();
if (vErr) die('יצירת גרסת קטלוג', vErr);

// ── פאזות ──
{
  const rows = catalog.phases.map((p) => ({
    version_id: version.id,
    key: p.key,
    title: p.title,
    sort: p.sort,
  }));
  const { error } = await supabase
    .from('catalog_phases')
    .upsert(rows, { onConflict: 'version_id,key' });
  if (error) die('טעינת פאזות', error);
  console.log(`✓ ${rows.length} פאזות`);
}

// ── משימות ──
{
  const rows = catalog.tasks.map((t) => ({
    version_id: version.id,
    key: t.key,
    phase_key: t.phase,
    role: t.role,
    title: t.title,
    body: t.body ?? null,
    requires_doc: t.requires_doc ?? false,
    doc_hint: t.doc_hint ?? null,
    links: t.links ?? [],
    form_ref: t.form_ref ?? null,
    source_url: t.source_url ?? null,
    critical: t.critical ?? false,
    optional: t.optional ?? false,
    applies_when: t.applies_when ?? {},
    date_rule: t.date_rule ?? null,
    sort: t.sort,
  }));
  const { error } = await supabase
    .from('catalog_tasks')
    .upsert(rows, { onConflict: 'version_id,key' });
  if (error) die('טעינת משימות', error);
  console.log(`✓ ${rows.length} משימות`);
}

console.log(`\nקטלוג ${version.semver} נטען.`);
if (version.published_at) {
  console.log('פורסם — נגיש לקריאה ציבורית.');
} else {
  console.log('טיוטה. ה-RLS לא יחשוף אותו עד שתריץ שוב עם --publish.');
}
