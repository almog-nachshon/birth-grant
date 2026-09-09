import ratesDoc from '@/content/rates.json';
import type { RateMap } from './engine/types.ts';

interface RateRow {
  key: string;
  value: number | null;
  unit: string;
  label?: string;
  scope?: string;
  confidence?: string;
  effective_from: string;
  effective_to?: string;
}

const rows = ratesDoc.rates as RateRow[];

/**
 * בונה מפת שיעורים התקפים לתאריך נתון.
 * כשיש כמה רשומות לאותו מפתח, נבחרת האחרונה שנכנסה לתוקף לפני התאריך.
 */
export function ratesAt(date: string = new Date().toISOString().slice(0, 10)): RateMap {
  const map: RateMap = {};
  const chosen: Record<string, string> = {};

  for (const r of rows) {
    if (r.effective_from > date) continue;
    if (r.effective_to && r.effective_to < date) continue;
    if (chosen[r.key] && chosen[r.key] >= r.effective_from) continue;
    chosen[r.key] = r.effective_from;
    map[r.key] = r.value;
  }
  return map;
}

/** מטא-דאטה להצגה — תווית, יחידה ורמת ודאות. */
export function rateMeta(key: string): RateRow | undefined {
  return rows.find((r) => r.key === key);
}

/** מחליף {{key}} בטקסט בערך המספרי. מפתח לא ידוע נשאר כפי שהוא. */
export function interpolate(text: string, rates: RateMap = ratesAt()): string {
  return text.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => {
    const v = rates[key];
    return v == null ? whole : v.toLocaleString('he-IL');
  });
}

/** התאריך שבו עודכן השיעור העדכני ביותר — להצגת "עודכן ב-". */
export function lastUpdated(): string {
  return rows.reduce((max, r) => (r.effective_from > max ? r.effective_from : max), '2000-01-01');
}
