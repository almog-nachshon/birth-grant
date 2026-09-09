// בדיקות גזירת המשימות — הלוגיקה שקובעת מה כל זוג רואה.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { resolveTasks, type CatalogTask } from './resolve-tasks.ts';
import type { CaseProfile, RateMap } from './types.ts';

const catalogDoc = JSON.parse(readFileSync(new URL('../../content/catalog.json', import.meta.url), 'utf8'));
const ratesDoc = JSON.parse(readFileSync(new URL('../../content/rates.json', import.meta.url), 'utf8'));
const CATALOG = catalogDoc.tasks as CatalogTask[];
const RATES: RateMap = Object.fromEntries(ratesDoc.rates.map((r: any) => [r.key, r.value]));

const profile = (over: Partial<CaseProfile> = {}): CaseProfile => ({
  dueDate: '2026-09-17',
  birthOrder: 1,
  multipleBirth: false,
  persons: [
    { role: 'birthing_parent', employment: 'employee', takesLeave: true, leaveWeeks: 15 },
    { role: 'partner', employment: 'employee', takesLeave: false },
  ],
  ...over,
});

const keys = (p: CaseProfile) => resolveTasks(CATALOG, p, RATES).map((t) => t.key);

test('שכירה בלי בן זוג מחליף — אין משימות טופס 360', () => {
  const k = keys(profile());
  assert.ok(!k.includes('form_360_fill'), 'טופס 360 לא אמור להופיע');
  assert.ok(k.includes('form_355_fill'), 'טופס 355 כן אמור');
});

test('בן זוג שלוקח חופשה — טופס 360 מופיע', () => {
  const k = keys(
    profile({
      persons: [
        { role: 'birthing_parent', employment: 'employee', takesLeave: true, leaveWeeks: 6 },
        { role: 'partner', employment: 'employee', takesLeave: true, leaveWeeks: 9 },
      ],
    }),
  );
  assert.ok(k.includes('form_360_fill'));
  assert.ok(k.includes('form_360_partner_return'));
});

test('שכירה לא מקבלת את משימות העצמאית', () => {
  const k = keys(profile());
  assert.ok(!k.includes('accountant_tax_assessment'));
  assert.ok(!k.includes('no_debt_bituach_leumi'));
});

test('עצמאית מקבלת שומת מס ובדיקת חוב', () => {
  const k = keys(
    profile({
      persons: [
        { role: 'birthing_parent', employment: 'self_employed', takesLeave: true, leaveWeeks: 15 },
        { role: 'partner', employment: 'employee', takesLeave: false },
      ],
    }),
  );
  assert.ok(k.includes('accountant_tax_assessment'));
  assert.ok(k.includes('no_debt_bituach_leumi'));
});

test('"both" מקיים גם שכיר וגם עצמאי', () => {
  const k = keys(
    profile({
      persons: [
        { role: 'birthing_parent', employment: 'both', takesLeave: true, leaveWeeks: 15 },
        { role: 'partner', employment: 'employee', takesLeave: false },
      ],
    }),
  );
  assert.ok(k.includes('accountant_tax_assessment'), 'משימת עצמאית');
  assert.ok(k.includes('hr_email'), 'משימת שכיר');
});

test('משימות נכות מופיעות רק כשמסומן', () => {
  const without = keys(profile());
  assert.ok(!without.includes('mod_special_needs_pregnancy'));
  assert.ok(!without.includes('disability_maternity_overlap'));

  const with_ = keys(
    profile({
      persons: [
        { role: 'birthing_parent', employment: 'employee', takesLeave: true, leaveWeeks: 15, hasDisabilityMOD: true, hasDisabilityBL: true },
        { role: 'partner', employment: 'employee', takesLeave: false },
      ],
    }),
  );
  assert.ok(with_.includes('mod_special_needs_pregnancy'));
  assert.ok(with_.includes('disability_maternity_overlap'));
});

test('נכות של הורה אחד לא מדביקה את השני', () => {
  // רגרסיה: קודם לכן משימת role:"any" מותנית נכות הופיעה גם לבן/בת הזוג
  // הבריא/ה, כי הבדיקה נפלה לרמת התיק במקום לרמת האדם.
  const tasks = resolveTasks(
    CATALOG,
    profile({
      persons: [
        { role: 'birthing_parent', employment: 'employee', takesLeave: true, leaveWeeks: 15, hasDisabilityMOD: true, hasDisabilityBL: true },
        { role: 'partner', employment: 'employee', takesLeave: false },
      ],
    }),
    RATES,
  );

  for (const key of ['mod_welfare_officer_contact', 'disability_maternity_overlap', 'mod_child_supplement']) {
    const rows = tasks.filter((t) => t.key === key);
    assert.equal(rows.length, 1, `${key} אמורה להופיע פעם אחת`);
    assert.equal(rows[0].assignedRole, 'birthing_parent', `${key} שייכת רק למי שיש לו/ה נכות`);
  }
});

test('כשלשני ההורים יש נכות — שניהם מקבלים', () => {
  const tasks = resolveTasks(
    CATALOG,
    profile({
      persons: [
        { role: 'birthing_parent', employment: 'employee', takesLeave: true, leaveWeeks: 15, hasDisabilityMOD: true },
        { role: 'partner', employment: 'employee', takesLeave: false, hasDisabilityMOD: true },
      ],
    }),
    RATES,
  );
  const rows = tasks.filter((t) => t.key === 'mod_welfare_officer_contact');
  assert.equal(rows.length, 2);
});

test('לא עובד/ת לא מקבל/ת משימות תלויות העסקה', () => {
  const k = resolveTasks(
    CATALOG,
    profile({
      persons: [
        { role: 'birthing_parent', employment: 'unemployed', takesLeave: true, leaveWeeks: 15 },
        { role: 'partner', employment: 'unemployed', takesLeave: false },
      ],
    }),
    RATES,
  );
  assert.ok(!k.some((t) => t.key === 'hr_email'));
  assert.ok(k.some((t) => t.key === 'hospital_report_check'), 'מענק לידה לא תלוי העסקה');
});

test('כל משימה מקבלת תאריך יעד כשיש לה כלל', () => {
  const tasks = resolveTasks(CATALOG, profile(), RATES);
  const withRule = tasks.filter((t) => t.date_rule);
  assert.ok(withRule.length > 0);
  assert.ok(withRule.every((t) => t.dueAt !== null), 'כלל תאריך חייב להניב תאריך');
});

test('הרשימה ממוינת לפי תאריך יעד', () => {
  const dated = resolveTasks(CATALOG, profile(), RATES).filter((t) => t.dueAt).map((t) => t.dueAt!);
  const sorted = [...dated].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(dated, sorted);
});

test('משימות משותפות מופיעות פעם אחת בלבד', () => {
  const k = keys(profile());
  const shared = k.filter((x) => x === 'hospital_report_check');
  assert.equal(shared.length, 1);
});

test('שני הורים שכירים מקבלים כל אחד את משימות ה-any', () => {
  const tasks = resolveTasks(
    CATALOG,
    profile({
      persons: [
        { role: 'birthing_parent', employment: 'employee', takesLeave: true, leaveWeeks: 6 },
        { role: 'partner', employment: 'employee', takesLeave: true, leaveWeeks: 9 },
      ],
    }),
    RATES,
  );
  const hr = tasks.filter((t) => t.key === 'hr_email');
  assert.equal(hr.length, 2);
  assert.deepEqual(hr.map((t) => t.assignedRole).sort(), ['birthing_parent', 'partner']);
});
