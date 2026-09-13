import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { calculateEntitlements } from '@/lib/engine/entitlements';
import { buildSchedule } from '@/lib/engine/schedule';
import { ratesAt } from '@/lib/rates';
import { toCaseProfile, type CaseRow, type PersonRow } from '@/lib/case/profile';
import TaskList from './TaskList';
import Calendar, { type CalendarItem } from './Calendar';
import s from './case.module.css';

export const dynamic = 'force-dynamic';

export default async function CasePage() {
  // לפני שהוקם פרויקט Supabase אין מה להציג — לדף הכניסה, שמסביר מה חסר
  if (!isSupabaseConfigured()) redirect('/login?next=/case');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/case');

  const { data: membership } = await supabase
    .from('case_members')
    .select('case_id, role')
    .limit(1)
    .maybeSingle();

  if (!membership) redirect('/account');
  const caseId = membership.case_id as string;

  const [{ data: caseRow }, { data: persons }, { data: tasks }, { data: docs }] = await Promise.all([
    supabase.from('cases').select('*').eq('id', caseId).single(),
    supabase.from('case_persons').select('*').eq('case_id', caseId),
    supabase.from('case_tasks').select('*').eq('case_id', caseId).order('sort'),
    supabase.from('case_documents').select('*').eq('case_id', caseId),
  ]);

  if (!caseRow) redirect('/account');

  const rates = ratesAt();
  const personRows = (persons ?? []) as unknown as PersonRow[];

  // הפרופיל נבנה משורות בסיס הנתונים ולא מערכים קשיחים — סדר הלידה, ריבוי
  // עוברים והקופה מגיעים מהאזור האישי ומשפיעים בפועל על המספרים.
  const profile = toCaseProfile(caseRow as unknown as CaseRow, personRows);
  if (!profile) redirect('/account');

  const entitlements = calculateEntitlements(profile, rates);
  const schedule = buildSchedule(profile, rates);

  const all = tasks ?? [];
  const done = all.filter((t) => t.status === 'done').length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  const critical = all.filter((t) => t.status !== 'done' && t.due_at);
  const nextUp = critical.length ? critical[0] : null;

  // היומן מאחד שני מקורות: מועדי המשימות, ואבני הדרך שנגזרות מתאריך הלידה.
  const calendarItems: CalendarItem[] = [
    ...all
      .filter((t) => t.due_at)
      .map((t) => ({
        id: t.id as string,
        date: t.due_at as string,
        title: t.title as string,
        kind: 'task' as const,
        done: t.status === 'done',
        dueKind: (t.due_kind ?? null) as string | null,
      })),
    ...schedule.map((e) => ({
      id: `sched-${e.key}`,
      date: e.date,
      title: e.label,
      kind: 'milestone' as const,
    })),
  ];

  return (
    <div className={s.shell}>
      <header className={s.header}>
        <div className={s.headerInner}>
          <a href="/" className={s.logo}>סדר בבלגן</a>
          <div className={s.headerRight}>
            <a href="/account" className={s.headerLink}>האזור האישי</a>
            <form action="/auth/signout" method="post">
              <button type="submit" className={s.signout}>יציאה</button>
            </form>
          </div>
        </div>
      </header>

      <main className={s.main}>
        <div className={s.top}>
          <div>
            <h1 className={s.title}>{caseRow.title}</h1>
            <p className={s.sub}>
              {caseRow.actual_birth_date
                ? `נולד ב-${new Date(caseRow.actual_birth_date).toLocaleDateString('he-IL')}`
                : `תאריך משוער: ${new Date(caseRow.due_date).toLocaleDateString('he-IL')}`}
              {' · '}
              {personRows.map((p) => p.display_name).filter(Boolean).join(' ו') || 'שני הורים'}
            </p>
          </div>
          <div className={s.progressCard}>
            <div className={s.progressNum}>{done}/{all.length}</div>
            <div className={s.progressLbl}>משימות הושלמו</div>
            <div className={s.bar}><div className={s.barFill} style={{ width: `${pct}%` }} /></div>
          </div>
        </div>

        {nextUp && (
          <div className={s.nextUp}>
            <span className={s.nextUpTag}>הבא בתור</span>
            <strong>{nextUp.title}</strong>
            {nextUp.due_at && (
              <span className={s.nextUpDate}>
                עד {new Date(nextUp.due_at).toLocaleDateString('he-IL')}
              </span>
            )}
          </div>
        )}

        <div className={s.grid}>
          <TaskList
            caseId={caseId}
            initialTasks={all}
            initialDocs={docs ?? []}
          />

          <aside className={s.aside}>
            <section className={s.panel}>
              <h2 className={s.panelTitle}>הערכת סכומים</h2>
              <div className={s.totalNum}>
                {entitlements.total.toLocaleString('he-IL', { maximumFractionDigits: 0 })} ₪
              </div>
              <p className={s.totalNote}>ברוטו, לפני ניכויים</p>
              <div className={s.moneyLines}>
                {entitlements.lines.map((l) => (
                  <div key={l.key} className={s.moneyLine}>
                    <span>{l.label}</span>
                    <strong data-c={l.confidence}>
                      {l.amount == null
                        ? '—'
                        : `${l.amount.toLocaleString('he-IL', { maximumFractionDigits: 0 })} ₪`}
                    </strong>
                  </div>
                ))}
              </div>
              {entitlements.missingInputs.length > 0 && (
                <p className={s.missing}>
                  חסר לחישוב מדויק: {entitlements.missingInputs.join(', ')}
                </p>
              )}
              <a href="/calculator" className={s.panelLink}>פירוט מלא של החישוב →</a>
            </section>

            <Calendar items={calendarItems} />

            <section className={s.panel}>
              <h2 className={s.panelTitle}>בן/בת הזוג</h2>
              <p className={s.panelBody}>
                שיתוף התיק נותן לשניכם את אותה רשימה ואת אותה התקדמות.
              </p>
              <button className={`btn btn-ghost ${s.full}`} disabled>
                הזמנה בקישור (בקרוב)
              </button>
            </section>
          </aside>
        </div>

        <p className={s.disclaimer}>{entitlements.disclaimer}</p>
      </main>
    </div>
  );
}
