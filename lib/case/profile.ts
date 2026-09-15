// המרה דו-כיוונית בין שורות בסיס הנתונים לבין CaseProfile שהמנוע מקבל,
// וחישוב שלמוּת הנתונים לכל חלק באזור האישי.
//
// זה המקום היחיד שיודע איך שדה בטבלה נקרא מול איך הוא נקרא במנוע.
// לפני הקובץ הזה מסך התיק בנה פרופיל בעצמו וקידד קשיח birthOrder: 1.

import type { CaseProfile, EmploymentType, ParentRole, PersonProfile } from '@/lib/engine/types';

export interface CaseRow {
  id: string;
  title: string;
  due_date: string | null;
  actual_birth_date: string | null;
  birth_order: number | null;
  multiple_birth: boolean | null;
  hmo: string | null;
  hotel_nights: number | null;
  pregnancy_basket_remaining: number | null;
}

export interface PersonRow {
  id: string;
  role: ParentRole;
  display_name: string | null;
  employment: EmploymentType;
  employer_name: string | null;
  has_employer_policy: boolean;
  takes_leave: boolean;
  leave_weeks: number | null;
  monthly_gross: number | null;
  annual_self_employed_income: number | null;
  insured_months_of_14: number | null;
  insured_months_of_22: number | null;
  insured_months_of_24: number | null;
  phone: string | null;
  email: string | null;
  user_id: string | null;
  work_stop_date: string | null;
  sick_paid_from_day_one: boolean;
  disability_percent_bl: number | null;
  disability_percent_mod: number | null;
  disability_items: Array<{ condition: string; percent: number | null }> | null;
  self_employed_status: 'exempt' | 'licensed' | 'company' | null;
  input_sources: Record<string, string> | null;
  extra: Record<string, boolean> | null;
}

/** null בבסיס הנתונים אומר "לא ידוע". undefined הוא מה שהמנוע מצפה לו. */
const opt = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

export function toPersonProfile(row: PersonRow): PersonProfile {
  return {
    role: row.role,
    employment: row.employment,
    takesLeave: row.takes_leave,
    leaveWeeks: opt(row.leave_weeks),
    monthlyGross: opt(row.monthly_gross),
    annualSelfEmployedIncome: opt(row.annual_self_employed_income),
    insuredMonthsOf14: opt(row.insured_months_of_14),
    insuredMonthsOf22: opt(row.insured_months_of_22),
    insuredMonthsOf24: opt(row.insured_months_of_24),
    workStopDate: opt(row.work_stop_date),
    sickPaidFromDayOne: row.sick_paid_from_day_one,
    hasEmployerPolicy: row.has_employer_policy,
    // אחוז שנקבע הוא עצמו הצהרה שיש נכות — הדגל נגזר ממנו כדי
    // שמשתמש שמילא אחוזים ושכח לסמן תיבה לא יאבד זכויות
    hasDisabilityBL: row.extra?.hasDisabilityBL || row.disability_percent_bl != null,
    hasDisabilityMOD: row.extra?.hasDisabilityMOD || row.disability_percent_mod != null,
    hasDisabilityWorkInjury: row.extra?.hasDisabilityWorkInjury ?? false,
    disabilityPercentBL: opt(row.disability_percent_bl),
    disabilityPercentMOD: opt(row.disability_percent_mod),
    selfEmployedStatus: opt(row.self_employed_status),
  };
}

/**
 * הפרופיל שהמנוע מחשב לפיו.
 * dueDate חסר הוא מצב לגיטימי באזור האישי — המנוע לא ירוץ עד שיוזן.
 */
export function toCaseProfile(caseRow: CaseRow, persons: PersonRow[]): CaseProfile | null {
  if (!caseRow.due_date) return null;
  return {
    dueDate: caseRow.due_date,
    actualBirthDate: opt(caseRow.actual_birth_date),
    birthOrder: ((caseRow.birth_order ?? 1) as 1 | 2 | 3),
    multipleBirth: caseRow.multiple_birth ?? false,
    hmo: opt(caseRow.hmo),
    hotelNights: opt(caseRow.hotel_nights),
    pregnancyBasketRemaining: opt(caseRow.pregnancy_basket_remaining),
    persons: persons.map(toPersonProfile),
  };
}

// ─────────────────────────────────────────────────────────────
// שלמוּת הנתונים
// ─────────────────────────────────────────────────────────────

export interface SectionProgress {
  key: string;
  label: string;
  /** 0–100 */
  percent: number;
  filled: number;
  total: number;
  /** תוויות השדות שעדיין חסרים — מוצגות למשתמש, לא רק מספר */
  missing: string[];
}

interface Check {
  label: string;
  done: boolean;
  /** שדה שלא חל על הפרופיל הזה כלל — לא נספר במכנה */
  skip?: boolean;
}

function score(key: string, label: string, checks: Check[]): SectionProgress {
  const relevant = checks.filter((c) => !c.skip);
  const filled = relevant.filter((c) => c.done).length;
  const total = relevant.length;
  return {
    key,
    label,
    percent: total === 0 ? 100 : Math.round((filled / total) * 100),
    filled,
    total,
    missing: relevant.filter((c) => !c.done).map((c) => c.label),
  };
}

/** שדות ההכנסה נדרשים רק ממי שעובד, ולפי סוג ההעסקה. */
function incomeChecks(p: PersonRow): Check[] {
  const employed = p.employment !== 'unemployed';
  const needsGross = p.employment === 'employee' || p.employment === 'both';
  const needsAnnual = p.employment === 'self_employed' || p.employment === 'both';

  return [
    { label: 'שכר ברוטו חודשי', done: p.monthly_gross != null, skip: !needsGross },
    { label: 'הכנסה שנתית לפי שומה', done: p.annual_self_employed_income != null, skip: !needsAnnual },
    { label: 'סוג העוסק', done: p.self_employed_status != null, skip: !needsAnnual },
    // שאלה אחת. שני חלונות החוק (14 ו-22) נשארים בסכמה לערך מדויק
    // שיגיע ממסמך, אבל אף אחד לא יודע לספור שניהם בעל פה.
    {
      label: 'חודשי ביטוח בשנתיים האחרונות',
      done:
        p.insured_months_of_24 != null ||
        p.insured_months_of_14 != null ||
        p.insured_months_of_22 != null,
      skip: !employed,
    },
    { label: 'יום הפסקת העבודה', done: p.work_stop_date != null, skip: !employed },
  ];
}

/**
 * @param profileName השם מהפרופיל של המשתמש המחובר, כשההורה הזה הוא הוא.
 * במסך הזה השדה קריא-בלבד ומוזן מהפרופיל, ולכן שורת המשימה יכולה להישאר
 * בלי display_name משלה — וזה לא אומר שחסר נתון.
 */
export function personProgress(
  row: PersonRow,
  label: string,
  profileName?: string | null,
): SectionProgress {
  const checks: Check[] = [
    { label: 'שם', done: Boolean(row.display_name?.trim() || profileName?.trim()) },
    { label: 'סוג העסקה', done: true }, // תמיד יש ברירת מחדל
    ...incomeChecks(row),
  ];
  if (row.role === 'partner') {
    checks.push({
      label: 'חלוקת שבועות',
      done: !row.takes_leave || row.leave_weeks != null,
    });
  }
  return score(row.role, label, checks);
}

/**
 * נכות היא חלק אופציונלי: מי שלא סימן שום נכות אינו "חסר נתונים".
 * ברגע שסומנה נכות, האחוז הופך לנתון חסר — הוא זה שפותח זכויות.
 */
export function disabilityProgress(rows: PersonRow[]): SectionProgress {
  const checks: Check[] = [];

  for (const row of rows) {
    const who = row.role === 'birthing_parent' ? 'היולדת' : 'בן/בת הזוג';
    const bl = row.extra?.hasDisabilityBL || row.disability_percent_bl != null;
    const mod = row.extra?.hasDisabilityMOD || row.disability_percent_mod != null;

    checks.push({
      label: `אחוז נכות כללית — ${who}`,
      done: row.disability_percent_bl != null,
      skip: !bl,
    });
    checks.push({
      label: `אחוז נכות אגף השיקום — ${who}`,
      done: row.disability_percent_mod != null,
      skip: !mod,
    });
  }

  return score('disability', 'נכות', checks);
}

/** הפרופיל של המשתמש עצמו: מי הוא בתיק ואיך יוצרים איתו קשר. */
export function profileProgress(
  me: { fullName: string | null; phone: string | null },
  myRole: 'birthing_parent' | 'partner' | null,
): SectionProgress {
  return score('profile', 'הפרופיל שלי', [
    { label: 'שם מלא', done: Boolean(me.fullName?.trim()) },
    { label: 'טלפון', done: Boolean(me.phone?.trim()) },
    { label: 'מי אני בתיק', done: myRole !== null },
  ]);
}

export function birthProgress(row: CaseRow): SectionProgress {
  return score('birth', 'הלידה', [
    { label: 'תאריך לידה משוער', done: Boolean(row.due_date) },
    { label: 'איזה ילד', done: row.birth_order != null },
    { label: 'קופת חולים', done: Boolean(row.hmo) },
  ]);
}

export const DOCUMENT_KINDS = [
  { kind: 'id_card', label: 'תעודת זהות + ספח', hint: 'הספח עם פרטי הילד/ה', required: true },
  { kind: 'payslip', label: 'תלוש שכר', hint: '3 התלושים שקדמו להפסקת העבודה', required: true },
  { kind: 'bank_details', label: 'אישור ניהול חשבון', hint: 'לתשלום דמי הלידה', required: true },
  { kind: 'hospital_discharge', label: 'מכתב שחרור מבית החולים', hint: 'אחרי הלידה', required: false },
  { kind: 'employer_letter', label: 'אישור מעסיק', hint: 'על הפסקת עבודה — לטופס 360', required: false },
  { kind: 'tax_assessment', label: 'שומת מס', hint: 'לעצמאים בלבד', required: false },
  { kind: 'insurance_policy', label: 'פוליסת ביטוח', hint: 'קולקטיב דרך המעסיק או פרטי', required: false },
  { kind: 'disability_protocol', label: 'פרוטוקול ועדה רפואית', hint: 'ההודעה עם אחוזי הנכות והפירוט', required: false },
  { kind: 'hotel_invoice', label: 'חשבונית מלונית', hint: 'להחזר מהקופה', required: false },
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]['kind'];

export function documentProgress(kinds: string[], persons: PersonRow[]): SectionProgress {
  const present = new Set(kinds);
  const anySelfEmployed = persons.some(
    (p) => p.employment === 'self_employed' || p.employment === 'both',
  );

  return score(
    'documents',
    'מסמכים',
    DOCUMENT_KINDS.filter((d) => d.required || d.kind === 'tax_assessment').map((d) => ({
      label: d.label,
      done: present.has(d.kind),
      // שומת מס נדרשת רק כשיש עצמאי/ת בתיק
      skip: d.kind === 'tax_assessment' && !anySelfEmployed,
    })),
  );
}

export function overallPercent(sections: SectionProgress[]): number {
  const filled = sections.reduce((sum, s) => sum + s.filled, 0);
  const total = sections.reduce((sum, s) => sum + s.total, 0);
  return total === 0 ? 0 : Math.round((filled / total) * 100);
}
