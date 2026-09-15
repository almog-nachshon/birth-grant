// יומן השינויים. JSON ולא קוד, מאותה סיבה שהקטלוג והשיעורים הם JSON:
// עדכון תוכן לא אמור לדרוש נגיעה ברכיב React.

import doc from '@/content/changelog.json';
import catalog from '@/content/catalog.json';

export interface ChangelogEntry {
  /** מופיע רק בערך ששינה את קטלוג הזכויות */
  version?: string;
  date: string;
  title: string;
  changes: string[];
}

export const entries = doc.entries as ChangelogEntry[];

/** הגרסה הנוכחית של קטלוג הזכויות — מה שמוצג בכותרת התחתונה. */
export const catalogVersion: string = catalog.version;

/** תאריך העדכון האחרון של האתר. */
export const lastChanged: string = entries[0]?.date ?? catalog.version;

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString('he-IL');
