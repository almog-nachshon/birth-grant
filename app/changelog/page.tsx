import s from '../legal.module.css';
import { entries, catalogVersion, formatDate } from '@/lib/changelog';

export const metadata = { title: 'מה חדש — מענקי לידה' };

export default function Changelog() {
  return (
    <main className={s.page}>
      <a href="/" className={s.back}>← לעמוד הבית</a>
      <h1 className={s.title}>מה חדש</h1>
      <p className={s.updated}>
        קטלוג הזכויות בגרסה {catalogVersion}. עודכן לאחרונה ב-{formatDate(entries[0].date)}.
      </p>

      {entries.map((e) => (
        <article key={`${e.date}-${e.title}`} className={s.entry}>
          <div className={s.entryHead}>
            <h2>{e.title}</h2>
            <span className={s.entryMeta}>
              {e.version && <span className={s.badge}>גרסה {e.version}</span>}
              <time dateTime={e.date}>{formatDate(e.date)}</time>
            </span>
          </div>
          <ul>
            {e.changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </article>
      ))}

      <p className={s.updated} style={{ marginTop: 40 }}>
        סכומים ושיעורים מתעדכנים בנפרד מהקטלוג, ומוצגים עם תאריך העדכון שלהם במחשבון.
      </p>
    </main>
  );
}
