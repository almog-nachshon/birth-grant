// חישוב לוח הזמנים של התיק.
// כל תאריך במערכת נגזר מכאן — אין תאריכים קשיחים בשום מקום אחר.
// עדכון תאריך הלידה בפועל מזיז אוטומטית את כל הלוח.

import type { CaseProfile, RateMap, ScheduleEntry } from './types.ts';

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addWeeks(iso: string, weeks: number): string {
  return addDays(iso, weeks * 7);
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  // הצמדה לסוף החודש כשהיום המקורי לא קיים בחודש היעד (31 בינואר + חודש)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

/** התאריך שממנו נגזר הכול: בפועל אם ידוע, אחרת משוער. */
export function anchorBirthDate(profile: CaseProfile): string {
  return profile.actualBirthDate ?? profile.dueDate;
}

export interface LeaveSplit {
  birthingWeeks: number;
  partnerWeeks: number;
  /** שבועות שלא נוצלו מתוך המכסה המשותפת */
  unusedWeeks: number;
  warnings: string[];
}

/**
 * חלוקת השבועות בין ההורים.
 * שני כללים נוקשים: היולדת חייבת מינימום 6 שבועות, והסך אינו עולה על 15.
 */
export function resolveLeaveSplit(profile: CaseProfile, rates: RateMap): LeaveSplit {
  const total = rates.maternity_total_weeks ?? 15;
  const minBirthing = rates.birthing_parent_min_weeks ?? 6;
  const warnings: string[] = [];

  const birthing = profile.persons.find((p) => p.role === 'birthing_parent');
  const partner = profile.persons.find((p) => p.role === 'partner');

  let birthingWeeks = birthing?.leaveWeeks ?? total;
  if (birthingWeeks < minBirthing) {
    warnings.push(
      `היולדת חייבת מינימום ${minBirthing} שבועות ואי אפשר לוותר עליהם — תוקן מ-${birthingWeeks}.`,
    );
    birthingWeeks = minBirthing;
  }
  if (birthingWeeks > total) birthingWeeks = total;

  let partnerWeeks = 0;
  if (partner?.takesLeave) {
    const available = total - birthingWeeks;
    partnerWeeks = partner.leaveWeeks ?? available;
    if (partnerWeeks > available) {
      warnings.push(
        `המכסה המשותפת היא ${total} שבועות בסך הכל, לא ${birthingWeeks + partnerWeeks}. יתרת בן/בת הזוג הוגבלה ל-${available}.`,
      );
      partnerWeeks = available;
    }
  }

  return {
    birthingWeeks,
    partnerWeeks,
    unusedWeeks: total - birthingWeeks - partnerWeeks,
    warnings,
  };
}

export function buildSchedule(profile: CaseProfile, rates: RateMap): ScheduleEntry[] {
  const birth = anchorBirthDate(profile);
  const split = resolveLeaveSplit(profile, rates);
  const isActual = Boolean(profile.actualBirthDate);

  const birthingEnd = addWeeks(birth, split.birthingWeeks);
  const entries: ScheduleEntry[] = [
    {
      key: 'birth',
      label: isActual ? 'תאריך הלידה' : 'תאריך לידה משוער',
      date: birth,
      kind: 'point',
    },
    {
      key: 'birthing_leave_start',
      label: 'תחילת חופשת היולדת',
      date: birth,
      kind: 'range_start',
    },
    {
      key: 'birthing_leave_end',
      label: `סיום חופשת היולדת (${split.birthingWeeks} שבועות)`,
      date: birthingEnd,
      kind: 'range_end',
    },
  ];

  if (split.partnerWeeks > 0) {
    entries.push(
      {
        key: 'partner_leave_start',
        label: 'תחילת תקופת בן/בת הזוג',
        date: birthingEnd,
        kind: 'range_start',
      },
      {
        key: 'partner_leave_end',
        label: `סיום תקופת בן/בת הזוג (${split.partnerWeeks} שבועות)`,
        date: addWeeks(birthingEnd, split.partnerWeeks),
        kind: 'range_end',
      },
    );
  }

  // מועד אחרון להגשת טופס 360 — נספר מיום הפסקת העבודה, לא מהלידה
  const partner = profile.persons.find((p) => p.role === 'partner');
  if (partner?.takesLeave) {
    const anchor = partner.workStopDate ?? birthingEnd;
    entries.push({
      key: 'form_360_deadline',
      label: 'מועד אחרון להגשת טופס 360',
      date: addMonths(anchor, rates.form_360_deadline_months ?? 12),
      kind: 'point',
    });
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

/** חישוב תאריך יעד למשימה לפי date_rule מהקטלוג. */
export function resolveTaskDate(
  rule: { anchor: string; offset_days?: number; offset_weeks?: number; offset_months?: number },
  profile: CaseProfile,
  rates: RateMap,
): string | null {
  const birth = anchorBirthDate(profile);
  const split = resolveLeaveSplit(profile, rates);
  const birthingEnd = addWeeks(birth, split.birthingWeeks);
  const partner = profile.persons.find((p) => p.role === 'partner');

  const anchors: Record<string, string | undefined> = {
    due_date: profile.dueDate,
    birth_date: birth,
    birthing_leave_start: birth,
    birthing_leave_end: birthingEnd,
    partner_leave_start: birthingEnd,
    partner_leave_end: addWeeks(birthingEnd, split.partnerWeeks),
    partner_work_stop: partner?.workStopDate ?? birthingEnd,
  };

  const base = anchors[rule.anchor];
  if (!base) return null;

  if (rule.offset_days !== undefined) return addDays(base, rule.offset_days);
  if (rule.offset_weeks !== undefined) return addWeeks(base, rule.offset_weeks);
  if (rule.offset_months !== undefined) return addMonths(base, rule.offset_months);
  return base;
}
