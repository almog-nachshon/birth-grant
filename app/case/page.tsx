import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { calculateEntitlements } from '@/lib/engine/entitlements';
import { buildSchedule } from '@/lib/engine/schedule';
import { ratesAt } from '@/lib/rates';
import type { CaseProfile, EmploymentType } from '@/lib/engine/types';
import TaskList from './TaskList';
import s from './case.module.css';

export const dynamic = 'force-dynamic';

interface PersonRow {
  id: string;
  role: 'birthing_parent' | 'partner';
  display_name: string | null;
  employment: EmploymentType;
  takes_leave: boolean;
  has_employer_policy: boolean;
  extra: Record<string, boolean>;
}

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

  if (!membership) redirect('/onboarding');
  const caseId = membership.case_id as string;

  const [{ data: caseRow }, { data: persons }, { data: tasks }, { data: docs }] = await Promise.all([
    supabase.from('cases').select('*').eq('id', caseId).single(),
    supabase.from('case_persons').select('*').eq('case_id', caseId),
    supabase.from('case_tasks').select('*').eq('case_id', caseId).order('sort'),
    supabase.from('case_documents').select('*').eq('case_id', caseId),
  ]);

  if (!caseRow) redirect('/onboarding');

  const rates = ratesAt();
  const personRows = (persons ?? []) as PersonRow[];

  const profile: CaseProfile = {
    dueDate: caseRow.due_date,
    actualBirthDate: caseRow.actual_birth_date ?? undefined,
    birthOrder: 1,
    multipleBirth: false,
    persons: personRows.map((p) => ({
      role: p.role,
      employment: p.employment,
      takesLeave: p.takes_leave,
      hasEmployerPolicy: p.has_employer_policy,
      hasDisabilityBL: p.extra?.hasDisabilityBL,
      hasDisabilityMOD: p.extra?.hasDisabilityMOD,
    })),
  };

  const entitlements = calculateEntitlements(profile, rates);
  const schedule = buildSchedule(profile, rates);

  const all = tasks ?? [];
  const done = all.filter((t) => t.status === 'done').length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  const critical = all.filter((t) => t.status !== 'done' && t.due_at);
  const nextUp = critical.length ? critical[0] : null;

  return (
    <div className={s.shell}>
      <header className={s.header}>
        <div className={s.headerInner}>
          <a href="/" className={s.logo}>סדר בבלגן</a>
          <form action="/auth/signout" method="post">
            <button type="submit" className={s.signout}>יציאה</button>
          </form>
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

            <section className={s.panel}>
              <h2 className={s.panelTitle}>לוח זמנים</h2>
              {schedule.map((e) => (
                <div key={e.key} className={s.schedRow}>
                  <span>{e.label}</span>
                  <strong>{new Date(e.date).toLocaleDateString('he-IL')}</strong>
                </div>
              ))}
            </section>

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
