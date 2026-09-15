// הטבות ומענקים לבעלי נכות מוכרת. התוכן ב-JSON ולא ברכיב, כמו הקטלוג
// והשיעורים — וגם כאן רמת הוודאות נוסעת עם הממצא ולא נמחקת בדרך לתצוגה.

import doc from '@/content/disability-benefits.json';

/** verified — מקור רשמי; secondary — מקור אמין שטרם אומת; open — שאלה פתוחה. */
export type BenefitConfidence = 'verified' | 'secondary' | 'open';

export interface Authority {
  key: 'bl' | 'mod';
  name: string;
  intro: string;
  contact: string;
  url?: string;
}

export interface Benefit {
  key: string;
  authority: Authority['key'];
  title: string;
  body: string;
  /** נפתחת רק מעל אחוז נכות מסוים */
  min_percent?: number;
  confidence: BenefitConfidence;
  /** איך מגישים בפועל */
  how?: string;
  source_url?: string;
}

export const authorities = doc.authorities as Authority[];
export const benefits = doc.benefits as Benefit[];

export const CONFIDENCE_LABEL: Record<BenefitConfidence, string> = {
  verified: 'מאומת',
  secondary: 'טעון אימות',
  open: 'שאלה פתוחה',
};

/**
 * ההטבות של רשות מסוימת, לפי האחוז שהוזן.
 * אחוז שלא הוזן אינו "מתחת לסף" אלא "לא ידוע" — מציגים את ההטבה,
 * מאותו שיקול שבגללו resolve-tasks מציג משימה כשהאחוז חסר: עדיף
 * לברר מאשר להסתיר זכות בשקט.
 */
export function benefitsFor(authority: Authority['key'], percent?: number | null): Benefit[] {
  return benefits.filter(
    (b) =>
      b.authority === authority &&
      (b.min_percent == null || percent == null || percent >= b.min_percent),
  );
}
