'use client';

import { useMemo, useState } from 'react';
import s from './calendar.module.css';

export interface CalendarItem {
  id: string;
  date: string;
  title: string;
  kind: 'task' | 'milestone';
  done?: boolean;
  /** deadline | due | window_start — קובע את חומרת ההצגה */
  dueKind?: string | null;
}

const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

/** כל החישובים ב-UTC. תאריכים במערכת הם מחרוזות ISO בלי אזור זמן,
 *  ומעבר דרך זמן מקומי היה מזיז יום שלם קדימה או אחורה. */
const iso = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

export default function Calendar({ items }: { items: CalendarItem[] }) {
  const today = new Date().toISOString().slice(0, 10);

  // נפתח בחודש של הפריט הפתוח הקרוב ביותר, לא בחודש הנוכחי —
  // תיק שנפתח לפני הלידה היה מציג חודש ריק לגמרי
  const initial = useMemo(() => {
    const upcoming = items
      .filter((i) => !i.done && i.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    const anchor = upcoming?.date ?? today;
    return { year: Number(anchor.slice(0, 4)), month: Number(anchor.slice(5, 7)) - 1 };
  }, [items, today]);

  const [view, setView] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const list = map.get(item.date);
      if (list) list.push(item);
      else map.set(item.date, [item]);
    }
    return map;
  }, [items]);

  const firstWeekday = new Date(Date.UTC(view.year, view.month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate();

  const cells: (string | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => iso(view.year, view.month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(view.year, view.month + delta, 1));
    setView({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
    setSelected(null);
  };

  const monthLabel = new Date(Date.UTC(view.year, view.month, 1)).toLocaleDateString('he-IL', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const selectedItems = selected ? (byDate.get(selected) ?? []) : [];
  const upcoming = items
    .filter((i) => !i.done && i.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);

  return (
    <section className={s.wrap}>
      <header className={s.head}>
        <h2 className={s.title}>היומן שלכם</h2>
        <div className={s.nav}>
          {/* בעברית החץ הימני מוביל אחורה בזמן */}
          <button onClick={() => shift(-1)} className={s.navBtn} aria-label="חודש קודם">›</button>
          <span className={s.month}>{monthLabel}</span>
          <button onClick={() => shift(1)} className={s.navBtn} aria-label="חודש הבא">‹</button>
        </div>
      </header>

      <div className={s.weekdays} aria-hidden>
        {WEEKDAYS.map((d) => <span key={d}>{d}</span>)}
      </div>

      <div className={s.grid}>
        {cells.map((date, i) => {
          if (!date) return <div key={`pad-${i}`} className={s.pad} />;
          const dayItems = byDate.get(date) ?? [];
          const open = dayItems.filter((x) => !x.done);
          return (
            <button
              key={date}
              className={s.day}
              data-today={date === today}
              data-selected={date === selected}
              data-has={dayItems.length > 0}
              onClick={() => setSelected(date === selected ? null : date)}
              aria-label={`${Number(date.slice(8))} — ${dayItems.length} פריטים`}
            >
              <span className={s.dayNum}>{Number(date.slice(8))}</span>
              {dayItems.length > 0 && (
                <span className={s.dots}>
                  {dayItems.slice(0, 3).map((item) => (
                    <span
                      key={item.id}
                      className={s.dot}
                      data-kind={item.kind}
                      data-done={item.done}
                      data-deadline={item.dueKind === 'deadline'}
                    />
                  ))}
                </span>
              )}
              {open.length > 0 && date < today && <span className={s.late} aria-hidden />}
            </button>
          );
        })}
      </div>

      <div className={s.legend}>
        <span><i className={s.dot} data-kind="milestone" /> אבן דרך</span>
        <span><i className={s.dot} data-kind="task" /> משימה</span>
        <span><i className={s.dot} data-kind="task" data-deadline="true" /> מועד אחרון</span>
        <span><i className={s.dot} data-kind="task" data-done="true" /> הושלם</span>
      </div>

      <div className={s.detail}>
        {selected ? (
          <>
            <p className={s.detailHead}>
              {new Date(selected + 'T00:00:00Z').toLocaleDateString('he-IL', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                timeZone: 'UTC',
              })}
            </p>
            {selectedItems.length === 0 ? (
              <p className={s.empty}>אין כלום ביום הזה.</p>
            ) : (
              <ul className={s.list}>
                {selectedItems.map((item) => (
                  <li key={item.id} className={s.item} data-done={item.done}>
                    <span className={s.dot} data-kind={item.kind} data-done={item.done} data-deadline={item.dueKind === 'deadline'} />
                    {item.title}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <p className={s.detailHead}>הבא בתור</p>
            {upcoming.length === 0 ? (
              <p className={s.empty}>אין מועדים פתוחים קדימה.</p>
            ) : (
              <ul className={s.list}>
                {upcoming.map((item) => (
                  <li key={item.id} className={s.item}>
                    <span className={s.dot} data-kind={item.kind} data-deadline={item.dueKind === 'deadline'} />
                    <span className={s.itemDate}>
                      {new Date(item.date + 'T00:00:00Z').toLocaleDateString('he-IL', {
                        day: 'numeric',
                        month: 'short',
                        timeZone: 'UTC',
                      })}
                    </span>
                    {item.title}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
