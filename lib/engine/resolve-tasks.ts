// גזירת רשימת המשימות של תיק מתוך הקטלוג.
//
// מתבצע פעם אחת ונשמר (materialized), לא מחושב בכל טעינה — כדי שסטטוסים
// והערות ישרדו פרסום גרסת קטלוג חדשה, ושנוכל להראות "נוספו לך משימות".

import type { CaseProfile, PersonProfile, RateMap, TaskLink } from './types.ts';
import { resolveTaskDate } from './schedule.ts';

export type { TaskLink };

export interface CatalogTask {
  key: string;
  phase: string;
  role: 'birthing_parent' | 'partner' | 'shared' | 'any';
  title: string;
  body?: string;
  requires_doc?: boolean;
  doc_hint?: string;
  links?: TaskLink[];
  form_ref?: string;
  source_url?: string;
  critical?: boolean;
  optional?: boolean;
  system?: boolean;
  applies_when?: Record<string, unknown>;
  date_rule?: { anchor: string; offset_days?: number; offset_weeks?: number; offset_months?: number; kind: string };
  sort: number;
}

export interface ResolvedTask extends CatalogTask {
  /** למי המשימה שייכת בפועל. null עבור shared. */
  assignedRole: 'birthing_parent' | 'partner' | null;
  dueAt: string | null;
}

/**
 * בודק תנאי תחולה יחיד מול הפרופיל.
 * מפתח `employment` נבדק מול האדם שהמשימה שייכת לו; השאר מול התיק.
 */
function matches(
  condition: Record<string, unknown>,
  person: PersonProfile | null,
  profile: CaseProfile,
): boolean {
  for (const [key, expected] of Object.entries(condition)) {
    let actual: unknown;

    switch (key) {
      case 'employment':
        if (!person) return false;
        // 'both' מקיים גם 'employee' וגם 'self_employed'
        if (person.employment === 'both') continue;
        actual = person.employment;
        break;
      case 'partner_takes_leave':
        actual = profile.persons.find((p) => p.role === 'partner')?.takesLeave ?? false;
        break;
      case 'has_employer_policy':
        actual = person?.hasEmployerPolicy ?? false;
        break;
      // דגלי נכות שייכים לאדם. כשהמשימה מיוחסת לאדם מסוים בודקים אותו בלבד —
      // נפילה לבדיקה ברמת התיק הייתה מציגה לבן/בת זוג בריא/ה זכויות של ההורה השני.
      // הבדיקה ברמת התיק חלה רק על משימות shared, שאין להן אדם.
      case 'has_disability_bl':
        actual = person ? (person.hasDisabilityBL ?? false) : profile.persons.some((p) => p.hasDisabilityBL);
        break;
      case 'has_disability_mod':
        actual = person ? (person.hasDisabilityMOD ?? false) : profile.persons.some((p) => p.hasDisabilityMOD);
        break;
      case 'has_disability_work_injury':
        actual = person
          ? (person.hasDisabilityWorkInjury ?? false)
          : profile.persons.some((p) => p.hasDisabilityWorkInjury);
        break;
      // סף אחוזים: זכות שנפתחת רק מעל אחוז מסוים.
      // אחוז שלא הוזן אינו "מתחת לסף" אלא "לא ידוע" — מציגים את
      // המשימה, כי עדיף לברר מאשר להסתיר זכות בשקט.
      case 'min_disability_pct_bl': {
        const pct = person?.disabilityPercentBL;
        if (pct == null) continue;
        if (typeof expected === 'number' && pct < expected) return false;
        continue;
      }
      case 'min_disability_pct_mod': {
        const pct = person?.disabilityPercentMOD;
        if (pct == null) continue;
        if (typeof expected === 'number' && pct < expected) return false;
        continue;
      }
      case 'multiple_birth':
        actual = profile.multipleBirth;
        break;
      case 'hmo':
        actual = profile.hmo;
        break;
      default:
        return false; // תנאי לא מוכר — לא מציגים, עדיף להחסיר מלהטעות
    }

    if (Array.isArray(expected)) {
      if (!expected.includes(actual)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

/** האנשים שמשימה עם role מסוים עשויה להיות שייכת להם. */
function candidatesFor(role: CatalogTask['role'], profile: CaseProfile): (PersonProfile | null)[] {
  switch (role) {
    case 'birthing_parent':
      return profile.persons.filter((p) => p.role === 'birthing_parent');
    case 'partner':
      return profile.persons.filter((p) => p.role === 'partner');
    case 'any':
      return profile.persons; // עשויה להופיע פעמיים, אחת לכל הורה
    case 'shared':
      return [null];
  }
}

export function resolveTasks(
  catalog: CatalogTask[],
  profile: CaseProfile,
  rates: RateMap,
): ResolvedTask[] {
  const out: ResolvedTask[] = [];

  for (const task of catalog) {
    for (const person of candidatesFor(task.role, profile)) {
      // אדם שלא עובד לא מקבל משימות שתלויות בהעסקה
      if (person && person.employment === 'unemployed' && task.applies_when?.employment) continue;
      // בן/בת זוג שלא לוקח/ת חופשה לא מקבל/ת את משימות ההחלפה
      if (person?.role === 'partner' && !person.takesLeave && task.applies_when?.partner_takes_leave) {
        continue;
      }
      if (task.applies_when && !matches(task.applies_when, person, profile)) continue;

      out.push({
        ...task,
        assignedRole: person?.role ?? null,
        dueAt: task.date_rule ? resolveTaskDate(task.date_rule, profile, rates) : null,
      });
    }
  }

  return out.sort((a, b) => {
    if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt.localeCompare(b.dueAt);
    if (a.dueAt && !b.dueAt) return -1;
    if (!a.dueAt && b.dueAt) return 1;
    return a.sort - b.sort;
  });
}
