// בדיקות מנוע החישוב. הרצה: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { addDays, addMonths, addWeeks, buildSchedule, resolveLeaveSplit, resolveTaskDate } from './schedule.ts';
import { calculateEntitlements, dailyAllowance } from './entitlements.ts';
import type { CaseProfile, RateMap } from './types.ts';

// טוענים את השיעורים האמיתיים — הבדיקות רצות מול אותו מקור אמת כמו האתר
const ratesDoc = JSON.parse(readFileSync(new URL('../../content/rates.json', import.meta.url), 'utf8'));
const RATES: RateMap = Object.fromEntries(ratesDoc.rates.map((r: any) => [r.key, r.value]));

const baseProfile = (over: Partial<CaseProfile> = {}): CaseProfile => ({
  dueDate: '2026-09-17',
  birthOrder: 1,
  multipleBirth: false,
  persons: [
    { role: 'birthing_parent', employment: 'self_employed', takesLeave: true, leaveWeeks: 6 },
    { role: 'partner', employment: 'employee', takesLeave: true, leaveWeeks: 9, monthlyGross: 30000 },
  ],
  ...over,
});

// ── אריתמטיקת תאריכים ───────────────────────────────────────
test('addDays חוצה גבול חודש', () => {
  assert.equal(addDays('2026-09-17', 14), '2026-10-01');
});

test('addWeeks מחשב 6 שבועות נכון', () => {
  assert.equal(addWeeks('2026-09-17', 6), '2026-10-29');
});

test('addMonths נצמד לסוף החודש כשהיום לא קיים', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-09-17', 12), '2027-09-17');
});

// ── חלוקת שבועות ────────────────────────────────────────────
test('היולדת לא יכולה לרדת מתחת ל-6 שבועות', () => {
  const split = resolveLeaveSplit(
    baseProfile({
      persons: [
        { role: 'birthing_parent', employment: 'employee', takesLeave: true, leaveWeeks: 2 },
        { role: 'partner', employment: 'employee', takesLeave: false },
      ],
    }),
    RATES,
  );
  assert.equal(split.birthingWeeks, 6);
  assert.match(split.warnings[0], /מינימום 6 שבועות/);
});

test('הסך אינו עולה על המכסה המשותפת', () => {
  const split = resolveLeaveSplit(
    baseProfile({
      persons: [
        { role: 'birthing_parent', employment: 'employee', takesLeave: true, leaveWeeks: 10 },
        { role: 'partner', employment: 'employee', takesLeave: true, leaveWeeks: 9 },
      ],
    }),
    RATES,
  );
  assert.equal(split.birthingWeeks + split.partnerWeeks, 15);
  assert.equal(split.partnerWeeks, 5);
  assert.match(split.warnings[0], /המכסה המשותפת/);
});

test('חלוקת 6/9 תקינה ולא מייצרת אזהרות', () => {
  const split = resolveLeaveSplit(baseProfile(), RATES);
  assert.deepEqual(
    { b: split.birthingWeeks, p: split.partnerWeeks, u: split.unusedWeeks, w: split.warnings.length },
    { b: 6, p: 9, u: 0, w: 0 },
  );
});

// ── לוח זמנים ───────────────────────────────────────────────
test('לוח הזמנים נגזר מהתאריך המשוער', () => {
  const s = buildSchedule(baseProfile(), RATES);
  const byKey = Object.fromEntries(s.map((e) => [e.key, e.date]));
  assert.equal(byKey.birth, '2026-09-17');
  assert.equal(byKey.birthing_leave_end, '2026-10-29');
  assert.equal(byKey.partner_leave_end, '2026-12-31');
});

test('תאריך לידה בפועל דורס את המשוער ומזיז את כל הלוח', () => {
  const s = buildSchedule(baseProfile({ actualBirthDate: '2026-09-24' }), RATES);
  const byKey = Object.fromEntries(s.map((e) => [e.key, e.date]));
  assert.equal(byKey.birth, '2026-09-24');
  assert.equal(byKey.birthing_leave_end, '2026-11-05');
});

test('מועד טופס 360 נספר מיום הפסקת העבודה ולא מהלידה', () => {
  const profile = baseProfile();
  profile.persons[1].workStopDate = '2026-10-29';
  const d = resolveTaskDate({ anchor: 'partner_work_stop', offset_months: 12 }, profile, RATES);
  assert.equal(d, '2027-10-29');
});

// ── תעריף יומי ──────────────────────────────────────────────
test('תעריף יומי לשכיר = ברוטו ÷ 30', () => {
  const { daily, capped } = dailyAllowance({ employment: 'employee', monthlyGross: 30000 }, RATES);
  assert.equal(daily, 1000);
  assert.equal(capped, false);
});

test('תעריף יומי מוגבל לתקרה', () => {
  const { daily, capped } = dailyAllowance({ employment: 'employee', monthlyGross: 90000 }, RATES);
  assert.equal(daily, RATES.maternity_daily_cap);
  assert.equal(capped, true);
});

test('עצמאי/ת מחושב מהכנסה שנתית לפי רבעון', () => {
  const { daily } = dailyAllowance(
    { employment: 'self_employed', annualSelfEmployedIncome: 120000 },
    RATES,
  );
  assert.equal(daily, round2(120000 / 4 / 90));
});

// ── זכאויות ─────────────────────────────────────────────────
test('מענק לידה נבחר לפי סדר הילד', () => {
  const first = calculateEntitlements(baseProfile(), RATES);
  const third = calculateEntitlements(baseProfile({ birthOrder: 3 }), RATES);
  assert.equal(first.lines.find((l) => l.key === 'birth_grant')!.amount, 2103);
  assert.equal(third.lines.find((l) => l.key === 'birth_grant')!.amount, 631);
});

test('תאומים גובר על סדר הילד', () => {
  const r = calculateEntitlements(baseProfile({ multipleBirth: true }), RATES);
  assert.equal(r.lines.find((l) => l.key === 'birth_grant')!.amount, 10514);
});

test('נתון חסר מדווח כ-needs_input ולא כאפס', () => {
  const r = calculateEntitlements(baseProfile(), RATES);
  const line = r.lines.find((l) => l.key === 'maternity_birthing_parent')!;
  assert.equal(line.amount, null);
  assert.equal(line.confidence, 'needs_input');
  assert.ok(r.missingInputs.some((m) => m.includes('שומה')));
});

test('ניכויים לעולם לא מנוחשים', () => {
  const r = calculateEntitlements(baseProfile(), RATES);
  const d = r.lines.find((l) => l.key === 'deductions')!;
  assert.equal(d.amount, null);
  assert.equal(d.confidence, 'unverifiable');
});

test('דמי לידה לבן/בת זוג מחושבים לפי ימי לוח', () => {
  const r = calculateEntitlements(baseProfile(), RATES);
  const line = r.lines.find((l) => l.key === 'maternity_partner')!;
  assert.equal(line.amount, 1000 * 9 * 7); // 63,000
});

test('5 ימי היעדרות — חוזה מיטיב מעלה את השווי', () => {
  const plain = calculateEntitlements(baseProfile(), RATES);
  const p = baseProfile();
  p.persons[1].sickPaidFromDayOne = true;
  const better = calculateEntitlements(p, RATES);
  const a = plain.lines.find((l) => l.key === 'paternity_days')!.amount!;
  const b = better.lines.find((l) => l.key === 'paternity_days')!.amount!;
  assert.ok(b > a, 'חוזה שמשלם מיום ראשון חייב להיות שווה יותר');
  assert.equal(round2(b / a), round2(5 / 4));
});

test('החזר מלונית מוגבל ליתרת הסל', () => {
  const r = calculateEntitlements(
    baseProfile({ hotelNights: 10, pregnancyBasketRemaining: 2000 }),
    RATES,
  );
  const line = r.lines.find((l) => l.key === 'hotel_refund')!;
  assert.equal(line.amount, 2000); // 259×10=2590, מוגבל ל-2000
});

test('הסתייגות תמיד מוצמדת לתוצאה', () => {
  const r = calculateEntitlements(baseProfile(), RATES);
  assert.match(r.disclaimer, /לא ייעוץ משפטי/);
});

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ── תנאי סף לדמי לידה ───────────────────────────────────────
// השאלון שואל שאלה אחת — חודשי ביטוח ב-24 חודשים. זה אינו אחד
// משני חלונות החוק, ולכן אסור שתוצאה ממנו תיראה ודאית.

const withInsurance = (over: Record<string, unknown>): CaseProfile =>
  baseProfile({
    persons: [
      {
        role: 'birthing_parent',
        employment: 'employee',
        takesLeave: true,
        leaveWeeks: 15,
        monthlyGross: 20000,
        ...over,
      },
      { role: 'partner', employment: 'unemployed', takesLeave: false },
    ],
  });

const maternityLine = (profile: CaseProfile) =>
  calculateEntitlements(profile, RATES).lines.find(
    (l) => l.key === 'maternity_birthing_parent',
  )!;

test('חלון 14 מדויק ומספיק — התוצאה ודאית', () => {
  const line = maternityLine(withInsurance({ insuredMonthsOf14: 12 }));
  assert.equal(line.confidence, 'calculated');
  assert.deepEqual(line.notes, []);
});

test('חלון 24 לעולם לא מסומן כוודאי, גם כשהכמות גדולה', () => {
  const line = maternityLine(withInsurance({ insuredMonthsOf24: 24 }));
  assert.equal(line.confidence, 'estimated');
  assert.ok(
    line.notes?.some((n) => n.includes('חלון צר יותר')),
    'ההערה חייבת לומר במפורש שהחלון שנבדק שונה מחלון החוק',
  );
});

test('חלון 24 עם כמות נמוכה מזהיר על זכאות חלקית', () => {
  const line = maternityLine(withInsurance({ insuredMonthsOf24: 8 }));
  assert.equal(line.confidence, 'estimated');
  assert.ok(line.notes?.some((n) => n.includes('חלקית')));
});

test('חלון 24 מתחת לסף החצי מזהיר שייתכן שאין זכאות', () => {
  const line = maternityLine(withInsurance({ insuredMonthsOf24: 3 }));
  assert.ok(line.notes?.some((n) => n.includes('אין זכאות')));
});

test('ערך מדויק גובר על חלון 24 כששניהם קיימים', () => {
  const line = maternityLine(withInsurance({ insuredMonthsOf14: 12, insuredMonthsOf24: 3 }));
  assert.equal(line.confidence, 'calculated');
});

test('בלי שום נתון ביטוח — מניח זכאות מלאה ואומר זאת', () => {
  const line = maternityLine(withInsurance({}));
  assert.equal(line.confidence, 'estimated');
  assert.ok(line.notes?.some((n) => n.includes('לא הוזנו חודשי ביטוח')));
});
