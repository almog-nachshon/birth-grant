// טיפוסי מנוע החישוב.
// המנוע הוא הסמכות היחידה למספרים באתר. מודל ה-AI מסביר את הפלט שלו — לא מייצר אותו.

export type EmploymentType = 'employee' | 'self_employed' | 'both' | 'unemployed';
export type ParentRole = 'birthing_parent' | 'partner';

/** רמת ודאות של ערך מחושב. מוצגת למשתמש — לא מוסתרת. */
export type Confidence = 'calculated' | 'estimated' | 'needs_input' | 'unverifiable';

export interface PersonProfile {
  role: ParentRole;
  employment: EmploymentType;
  /** שכר ברוטו חודשי ממוצע ב-3 החודשים שקדמו ליום הקובע (שכיר/ה) */
  monthlyGross?: number;
  /** הכנסה שנתית לפי השומה הגבוהה מבין השתיים (עצמאי/ת) */
  annualSelfEmployedIncome?: number;
  /** חודשי ביטוח מתוך 14 שקדמו ליום הקובע */
  insuredMonthsOf14?: number;
  /** חודשי ביטוח מתוך 22 */
  insuredMonthsOf22?: number;
  takesLeave: boolean;
  /** שבועות שהאדם הזה לוקח מתוך המכסה המשותפת */
  leaveWeeks?: number;
  /** "היום הקובע" — יום הפסקת העבודה. קריטי לטופס 360. */
  workStopDate?: string;
  hasEmployerPolicy?: boolean;
  /** חוזה שמשלם 100% מיום מחלה ראשון */
  sickPaidFromDayOne?: boolean;
  hasDisabilityBL?: boolean;
  hasDisabilityMOD?: boolean;
  hasDisabilityWorkInjury?: boolean;
}

export interface CaseProfile {
  dueDate: string;
  actualBirthDate?: string;
  birthOrder: 1 | 2 | 3;
  multipleBirth: boolean;
  hmo?: string;
  persons: PersonProfile[];
  /** ימי שהייה מתוכננים במלונית */
  hotelNights?: number;
  /** יתרה פנויה בסל הריון ולידה */
  pregnancyBasketRemaining?: number;
}

export type RateMap = Record<string, number | null>;

export interface ScheduleEntry {
  key: string;
  label: string;
  date: string;
  kind: 'point' | 'range_start' | 'range_end';
}

export interface MoneyLine {
  key: string;
  label: string;
  amount: number | null;
  confidence: Confidence;
  /** הסבר שקוף של החישוב — מוצג למשתמש כ"כך חושב" */
  formula: string;
  notes?: string[];
}

export interface EntitlementResult {
  lines: MoneyLine[];
  total: number;
  /** סכום השורות שלא ניתן היה לחשב */
  missingInputs: string[];
  disclaimer: string;
}
