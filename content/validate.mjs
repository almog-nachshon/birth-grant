// אימות תקינות התוכן. מריצים: node content/validate.mjs
// נכשל בקוד יציאה 1 אם יש שגיאה — מתאים ל-CI ולבדיקה לפני seed.
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url), 'utf8'));
const ratesDoc = JSON.parse(readFileSync(new URL('./rates.json', import.meta.url), 'utf8'));

const errors = [];
const warnings = [];

// --- שיעורים ---
const rateKeys = new Set();
for (const r of ratesDoc.rates) {
  if (rateKeys.has(r.key)) errors.push(`שיעור כפול: ${r.key}`);
  rateKeys.add(r.key);
  if (!r.effective_from) errors.push(`שיעור ללא effective_from: ${r.key}`);
}
const unverified = ratesDoc.rates.filter((r) => r.value === null || r.confidence === 'needs_verification');

// --- פאזות ---
const phaseKeys = new Set(catalog.phases.map((p) => p.key));

// --- משימות ---
const seen = new Set();
const VALID_ROLES = new Set(['birthing_parent', 'partner', 'shared', 'any']);
const VALID_ANCHORS = new Set([
  'due_date', 'birth_date', 'birthing_leave_start', 'birthing_leave_end',
  'partner_leave_start', 'partner_leave_end', 'partner_work_stop',
]);
const VALID_KINDS = new Set(['due', 'deadline', 'window_start']);

for (const t of catalog.tasks) {
  const at = `משימה "${t.key}"`;
  if (seen.has(t.key)) errors.push(`מפתח משימה כפול: ${t.key}`);
  seen.add(t.key);

  if (!phaseKeys.has(t.phase)) errors.push(`${at}: פאזה לא מוכרת "${t.phase}"`);
  if (!VALID_ROLES.has(t.role)) errors.push(`${at}: role לא חוקי "${t.role}"`);
  if (!t.title) errors.push(`${at}: חסרה כותרת`);
  if (t.requires_doc && !t.doc_hint) warnings.push(`${at}: requires_doc בלי doc_hint`);

  if (t.date_rule) {
    const d = t.date_rule;
    if (!VALID_ANCHORS.has(d.anchor)) errors.push(`${at}: anchor לא מוכר "${d.anchor}"`);
    if (!VALID_KINDS.has(d.kind)) errors.push(`${at}: kind לא מוכר "${d.kind}"`);
    const offsets = ['offset_days', 'offset_weeks', 'offset_months'].filter((k) => k in d);
    if (offsets.length !== 1) errors.push(`${at}: צריך בדיוק offset אחד, נמצאו ${offsets.length}`);
  }

  // כל {{key}} חייב להתקיים בטבלת השיעורים
  for (const m of String(t.body ?? '').matchAll(/\{\{(\w+)\}\}/g)) {
    if (!rateKeys.has(m[1])) errors.push(`${at}: מפנה לשיעור לא קיים {{${m[1]}}}`);
  }
}

// --- דוח ---
const byRole = {};
const byPhase = {};
for (const t of catalog.tasks) {
  byRole[t.role] = (byRole[t.role] ?? 0) + 1;
  byPhase[t.phase] = (byPhase[t.phase] ?? 0) + 1;
}

console.log(`קטלוג ${catalog.version} — ${catalog.phases.length} פאזות, ${catalog.tasks.length} משימות, ${ratesDoc.rates.length} שיעורים`);
console.log('לפי תפקיד:', byRole);
console.log('לפי פאזה:', byPhase);
console.log(`דורשות מסמך: ${catalog.tasks.filter((t) => t.requires_doc).length} | קריטיות: ${catalog.tasks.filter((t) => t.critical).length} | עם כלל תאריך: ${catalog.tasks.filter((t) => t.date_rule).length} | מותנות: ${catalog.tasks.filter((t) => t.applies_when).length}`);

if (unverified.length) {
  console.log(`\nדורשים אימות לפני הצגה (${unverified.length}):`);
  for (const r of unverified) console.log(`  - ${r.key} — ${r.label}`);
}
if (warnings.length) {
  console.log(`\nאזהרות (${warnings.length}):`);
  for (const w of warnings) console.log(`  ! ${w}`);
}
if (errors.length) {
  console.error(`\nשגיאות (${errors.length}):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log('\n✓ התוכן תקין');
