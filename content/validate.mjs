// אימות תקינות התוכן. מריצים: node content/validate.mjs
// נכשל בקוד יציאה 1 אם יש שגיאה — מתאים ל-CI ולבדיקה לפני seed.
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url), 'utf8'));
const ratesDoc = JSON.parse(readFileSync(new URL('./rates.json', import.meta.url), 'utf8'));
const changelog = JSON.parse(readFileSync(new URL('./changelog.json', import.meta.url), 'utf8'));
const disability = JSON.parse(
  readFileSync(new URL('./disability-benefits.json', import.meta.url), 'utf8'),
);

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
const VALID_LINK_KINDS = new Set(['online', 'form', 'info']);

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

  // קישורים רשמיים: https בלבד — המשתמש נשלח מכאן לאתר ממשלתי
  if (t.links !== undefined) {
    if (!Array.isArray(t.links)) {
      errors.push(`${at}: links חייב להיות מערך`);
    } else {
      for (const l of t.links) {
        const what = l?.label ?? l?.url ?? '(ריק)';
        if (!l?.label) errors.push(`${at}: קישור ללא תווית — ${l?.url ?? ''}`);
        if (!String(l?.url ?? '').startsWith('https://')) {
          errors.push(`${at}: קישור שאינו https — ${what}`);
        }
        if (!VALID_LINK_KINDS.has(l?.kind)) errors.push(`${at}: kind לא מוכר לקישור "${l?.kind}" — ${what}`);
      }
    }
  }

  // כל {{key}} חייב להתקיים בטבלת השיעורים
  for (const m of String(t.body ?? '').matchAll(/\{\{(\w+)\}\}/g)) {
    if (!rateKeys.has(m[1])) errors.push(`${at}: מפנה לשיעור לא קיים {{${m[1]}}}`);
  }
}

// --- הטבות נכות ---
// ממצא שאינו verified מוצג באתר עם תג "טעון אימות"/"שאלה פתוחה". לכן
// confidence חייב להיות תקין: ערך לא מוכר היה מוצג בלי תג, כלומר כעובדה.
{
  const VALID_CONF = new Set(['verified', 'secondary', 'open']);
  const authorityKeys = new Set(disability.authorities.map((a) => a.key));

  for (const a of disability.authorities) {
    if (!a.name || !a.intro || !a.contact) errors.push(`רשות "${a.key}": חסר שם, מבוא או דרך פנייה`);
  }

  const seenBenefits = new Set();
  for (const x of disability.benefits) {
    const at = `הטבה "${x.key}"`;
    if (seenBenefits.has(x.key)) errors.push(`מפתח הטבה כפול: ${x.key}`);
    seenBenefits.add(x.key);

    if (!authorityKeys.has(x.authority)) errors.push(`${at}: רשות לא מוכרת "${x.authority}"`);
    if (!x.title || !x.body) errors.push(`${at}: חסרה כותרת או גוף`);
    if (!VALID_CONF.has(x.confidence)) errors.push(`${at}: confidence לא מוכר "${x.confidence}"`);
    if (x.min_percent != null && (x.min_percent < 0 || x.min_percent > 100)) {
      errors.push(`${at}: אחוז סף לא חוקי ${x.min_percent}`);
    }
    if (x.source_url && !String(x.source_url).startsWith('https://')) {
      errors.push(`${at}: מקור שאינו https`);
    }
    // ממצא שאינו מאומת חייב לומר למשתמש מה לעשות איתו
    if (x.confidence !== 'verified' && !x.how) {
      warnings.push(`${at}: ${x.confidence} בלי הנחיית "איך" — המשתמש לא יידע מה לברר`);
    }
  }
}

// --- יומן שינויים ---
// האתר מציג את גרסת הקטלוג בכותרת התחתונה ומקשר ליומן. אם הקטלוג
// עודכן בלי ערך מתאים ביומן, המשתמש רואה גרסה שאין לה הסבר.
{
  const seenVersions = new Set();
  let previousDate = null;

  for (const [i, e] of changelog.entries.entries()) {
    const at = `ערך יומן #${i + 1}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date ?? '')) errors.push(`${at}: תאריך לא תקין "${e.date}"`);
    if (!e.title) errors.push(`${at}: חסרה כותרת`);
    if (!Array.isArray(e.changes) || !e.changes.length) errors.push(`${at}: אין רשימת שינויים`);

    if (previousDate && e.date > previousDate) {
      errors.push(`${at}: היומן חייב להיות מסודר מהחדש לישן (${e.date} אחרי ${previousDate})`);
    }
    previousDate = e.date ?? previousDate;

    if (e.version) {
      if (seenVersions.has(e.version)) errors.push(`${at}: גרסה כפולה ${e.version}`);
      seenVersions.add(e.version);
    }
  }

  const newest = changelog.entries.find((e) => e.version);
  if (!newest) {
    errors.push('אין ביומן אף ערך עם גרסה');
  } else if (newest.version !== catalog.version) {
    errors.push(
      `הקטלוג בגרסה ${catalog.version} אבל הערך האחרון ביומן הוא ${newest.version} — ` +
        'עדכן את content/changelog.json',
    );
  }
}

// --- דוח ---
const byRole = {};
const byPhase = {};
for (const t of catalog.tasks) {
  byRole[t.role] = (byRole[t.role] ?? 0) + 1;
  byPhase[t.phase] = (byPhase[t.phase] ?? 0) + 1;
}

const conf = {};
for (const x of disability.benefits) conf[x.confidence] = (conf[x.confidence] ?? 0) + 1;
console.log(
  `הטבות נכות: ${disability.benefits.length} ב-${disability.authorities.length} רשויות`,
  conf,
);
console.log(`יומן שינויים: ${changelog.entries.length} ערכים, אחרון ${changelog.entries[0]?.date}`);
console.log(`קטלוג ${catalog.version} — ${catalog.phases.length} פאזות, ${catalog.tasks.length} משימות, ${ratesDoc.rates.length} שיעורים`);
console.log('לפי תפקיד:', byRole);
console.log('לפי פאזה:', byPhase);
const links = catalog.tasks.flatMap((t) => t.links ?? []);
console.log(
  `עם קישורים: ${catalog.tasks.filter((t) => t.links?.length).length} | קישורים: ${links.length} ` +
    `(מקוונים ${links.filter((l) => l.kind === 'online').length}, ` +
    `טפסים ${links.filter((l) => l.kind === 'form').length}, ` +
    `מידע ${links.filter((l) => l.kind === 'info').length})`,
);
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
