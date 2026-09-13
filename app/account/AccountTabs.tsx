'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DOCUMENT_KINDS,
  birthProgress,
  documentProgress,
  overallPercent,
  personProgress,
  type CaseRow,
  type PersonRow,
} from '@/lib/case/profile';
import type { EmploymentType, EntitlementResult } from '@/lib/engine/types';
import s from './account.module.css';

const HMOS = ['כללית', 'מכבי', 'מאוחדת', 'לאומית'];
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'];

const EMPLOYMENT_LABELS: Record<EmploymentType, [string, string]> = {
  employee: ['שכירה', 'שכיר/ה'],
  self_employed: ['עצמאית', 'עצמאי/ת'],
  both: ['שכירה וגם עצמאית', 'שכיר/ה וגם עצמאי/ת'],
  unemployed: ['לא עובדת', 'לא עובד/ת'],
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function AccountTabs({
  userName,
  avatarUrl,
  caseRow,
  birthing: initialBirthing,
  partner: initialPartner,
  docKinds: initialDocKinds,
  entitlements,
  taskStats,
}: {
  userName: string;
  avatarUrl: string | null;
  caseRow: CaseRow;
  birthing: PersonRow;
  partner: PersonRow;
  docKinds: string[];
  entitlements: EntitlementResult | null;
  taskStats: { total: number; done: number; nextDue: string | null };
}) {
  const router = useRouter();
  const [tab, setTab] = useState('birth');
  const [c, setC] = useState(caseRow);
  const [b, setB] = useState(initialBirthing);
  const [p, setP] = useState(initialPartner);
  const [docKinds, setDocKinds] = useState(initialDocKinds);
  // מזהה התיק האמיתי. נוצר בשרת בשמירה הראשונה, ולכן חייב לחזור משם
  // ולא להישאר על ערך ה-placeholder של הפרופיל הריק.
  const [caseId, setCaseId] = useState(caseRow.id);
  const [save, setSave] = useState<SaveState>('idle');
  const [error, setError] = useState('');

  // הנתונים שנשמרו לאחרונה. השוואה מולם מונעת PATCH על שינוי שלא היה.
  const committed = useRef({ c: caseRow, b: initialBirthing, p: initialPartner });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── שלמוּת מחושבת מהמצב המקומי, כדי שהאחוזים יזוזו תוך כדי הקלדה ──
  const sections = useMemo(
    () => [
      birthProgress(c),
      personProgress(b, 'היולדת'),
      personProgress(p, 'בן/בת הזוג'),
      documentProgress(docKinds, [b, p]),
    ],
    [c, b, p, docKinds],
  );
  const overall = overallPercent(sections);
  const pctOf = (key: string) => sections.find((x) => x.key === key)?.percent ?? 0;

  const flush = useCallback(async () => {
    const body: Record<string, unknown> = {};
    const diff = <T extends Record<string, unknown>>(next: T, prev: T) => {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(next)) {
        if (next[key] !== prev[key]) out[key] = next[key];
      }
      return out;
    };

    const caseChanges = diff(toCasePayload(c), toCasePayload(committed.current.c));
    const bChanges = diff(toPersonPayload(b), toPersonPayload(committed.current.b));
    const pChanges = diff(toPersonPayload(p), toPersonPayload(committed.current.p));

    if (Object.keys(caseChanges).length) body.case = caseChanges;
    if (Object.keys(bChanges).length) body.birthing = bChanges;
    if (Object.keys(pChanges).length) body.partner = pChanges;
    if (!Object.keys(body).length) return;

    setSave('saving');
    setError('');
    try {
      const res = await fetch('/api/case/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok && res.status !== 207) throw new Error(json.error ?? 'השמירה נכשלה');

      committed.current = { c, b, p };
      if (json.case?.id) setCaseId(json.case.id as string);
      setSave('saved');
      if (json.warning) setError(json.warning);
      router.refresh();
    } catch (err) {
      setSave('error');
      setError(err instanceof Error ? err.message : 'השמירה נכשלה');
    }
  }, [c, b, p, router]);

  // שמירה אוטומטית מושהית. השדות כאן כספיים — עדיף להמתין לסוף ההקלדה
  // מאשר לשלוח בקשה על כל הקשה.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 1100);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flush]);

  const TOTAL_WEEKS = 15;
  const setSplit = useCallback((partnerWeeks: number) => {
    setB((prev) => ({ ...prev, leave_weeks: TOTAL_WEEKS - partnerWeeks }));
    setP((prev) => ({ ...prev, leave_weeks: partnerWeeks }));
  }, []);

  const setPartnerTakesLeave = useCallback((takes: boolean) => {
    setP((prev) => ({ ...prev, takes_leave: takes, leave_weeks: takes ? (prev.leave_weeks ?? 0) : 0 }));
    if (!takes) setB((prev) => ({ ...prev, leave_weeks: TOTAL_WEEKS }));
  }, []);

  const tabs = [
    { key: 'birth', label: 'הלידה', pct: pctOf('birth') },
    { key: 'birthing_parent', label: 'היולדת', pct: pctOf('birthing_parent') },
    { key: 'partner', label: 'בן/בת הזוג', pct: pctOf('partner') },
    { key: 'documents', label: 'מסמכים', pct: pctOf('documents') },
    { key: 'summary', label: 'סיכום', pct: null as number | null },
  ];

  return (
    <div className={s.shell}>
      <header className={s.header}>
        <div className={s.headerInner}>
          <a href="/" className={s.logo}>סדר בבלגן</a>
          <div className={s.headerRight}>
            {caseId !== 'new' && (
              <a href="/case" className={s.headerLink}>המשימות שלי</a>
            )}
            <form action="/auth/signout" method="post">
              <button type="submit" className={s.signout}>יציאה</button>
            </form>
          </div>
        </div>
      </header>

      <main id="main" className={s.main}>
        <div className={s.hero}>
          <div className={s.heroText}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className={s.avatar} />
            ) : (
              <div className={s.avatarFallback} aria-hidden>{userName.slice(0, 1) || '?'}</div>
            )}
            <div>
              <h1 className={s.title}>האזור האישי של {userName}</h1>
              <p className={s.sub}>
                {overall === 100
                  ? 'כל הנתונים הושלמו. החישוב והמשימות מעודכנים.'
                  : 'ככל שתשלימו יותר נתונים, החישוב מדויק יותר והמשימות אישיות יותר.'}
              </p>
            </div>
          </div>
          <Ring percent={overall} />
        </div>

        <div className={s.statusRow}>
          <SaveBadge state={save} />
          {error && <span className={s.errorInline}>{error}</span>}
          {taskStats.total > 0 && (
            <span className={s.statusMeta}>
              {taskStats.done}/{taskStats.total} משימות הושלמו
              {taskStats.nextDue &&
                ` · הבאה עד ${new Date(taskStats.nextDue).toLocaleDateString('he-IL')}`}
            </span>
          )}
        </div>

        <nav className={s.tabs} role="tablist" aria-label="חלקי האזור האישי">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={s.tab}
              data-active={tab === t.key}
            >
              <span className={s.tabLabel}>{t.label}</span>
              {t.pct !== null && (
                <span className={s.tabPct} data-full={t.pct === 100}>
                  {t.pct}%
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className={s.panel} role="tabpanel">
          {tab === 'birth' && <BirthTab c={c} setC={setC} />}
          {tab === 'birthing_parent' && (
            <PersonTab person={b} setPerson={setB} variant="birthing" />
          )}
          {tab === 'partner' && (
            <PersonTab
              person={p}
              setPerson={setP}
              variant="partner"
              onSplitChange={setSplit}
              onTakesLeaveChange={setPartnerTakesLeave}
            />
          )}
          {tab === 'documents' && (
            <DocumentsTab
              caseId={caseId}
              hasCase={caseId !== 'new'}
              docKinds={docKinds}
              onUploaded={(kind) => setDocKinds((prev) => [...prev, kind])}
            />
          )}
          {tab === 'summary' && (
            <SummaryTab
              entitlements={entitlements}
              sections={sections}
              hasCase={caseId !== 'new'}
            />
          )}
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// המרה למבנה שה-API מצפה לו
// ─────────────────────────────────────────────────────────────
function toCasePayload(c: CaseRow) {
  return {
    dueDate: c.due_date,
    actualBirthDate: c.actual_birth_date,
    birthOrder: c.birth_order,
    multipleBirth: c.multiple_birth,
    hmo: c.hmo,
    hotelNights: c.hotel_nights,
  } as Record<string, unknown>;
}

function toPersonPayload(p: PersonRow) {
  return {
    displayName: p.display_name,
    employment: p.employment,
    employerName: p.employer_name,
    hasEmployerPolicy: p.has_employer_policy,
    takesLeave: p.takes_leave,
    leaveWeeks: p.leave_weeks,
    monthlyGross: p.monthly_gross,
    annualSelfEmployedIncome: p.annual_self_employed_income,
    insuredMonthsOf14: p.insured_months_of_14,
    insuredMonthsOf22: p.insured_months_of_22,
    workStopDate: p.work_stop_date,
    sickPaidFromDayOne: p.sick_paid_from_day_one,
    hasDisabilityBL: p.extra?.hasDisabilityBL ?? false,
    hasDisabilityMOD: p.extra?.hasDisabilityMOD ?? false,
    hasDisabilityWorkInjury: p.extra?.hasDisabilityWorkInjury ?? false,
  } as Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
// טאבים
// ─────────────────────────────────────────────────────────────
function BirthTab({ c, setC }: { c: CaseRow; setC: (fn: (prev: CaseRow) => CaseRow) => void }) {
  const set = <K extends keyof CaseRow>(key: K, value: CaseRow[K]) =>
    setC((prev) => ({ ...prev, [key]: value }));

  return (
    <section className={s.form}>
      <p className={s.formIntro}>
        כל תאריך במערכת נגזר מכאן. עדכון תאריך הלידה בפועל מזיז אוטומטית את כל לוח הזמנים
        ואת כל מועדי ההגשה.
      </p>

      <div className={s.grid2}>
        <Field label="תאריך לידה משוער" hint="השדה היחיד שבלעדיו אי אפשר לחשב דבר">
          <input
            type="date"
            className={s.input}
            value={c.due_date ?? ''}
            onChange={(e) => set('due_date', e.target.value || null)}
          />
        </Field>

        <Field label="תאריך לידה בפועל" hint="למלא אחרי הלידה — הכול יתעדכן">
          <input
            type="date"
            className={s.input}
            value={c.actual_birth_date ?? ''}
            onChange={(e) => set('actual_birth_date', e.target.value || null)}
          />
        </Field>

        <Field label="איזה ילד" hint="קובע את גובה מענק הלידה">
          <select
            className={s.input}
            value={c.birth_order ?? 1}
            onChange={(e) => set('birth_order', Number(e.target.value))}
          >
            <option value={1}>ראשון</option>
            <option value={2}>שני</option>
            <option value={3}>שלישי ואילך</option>
          </select>
        </Field>

        <Field label="קופת חולים" hint="משפיע על החזרי מלונית וסל הריון">
          <select
            className={s.input}
            value={c.hmo ?? ''}
            onChange={(e) => set('hmo', e.target.value || null)}
          >
            <option value="">לא לציין</option>
            {HMOS.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </Field>

        <Field label="לילות מלונית" hint="להחזר מהקופה. אפשר להשלים בהמשך">
          <input
            type="number"
            min={0}
            max={60}
            className={s.input}
            value={c.hotel_nights ?? ''}
            onChange={(e) =>
              set('hotel_nights', e.target.value === '' ? null : Number(e.target.value))
            }
          />
        </Field>
      </div>

      <label className={s.check}>
        <input
          type="checkbox"
          checked={c.multiple_birth ?? false}
          onChange={(e) => set('multiple_birth', e.target.checked)}
        />
        <span>לידה מרובת עוברים</span>
      </label>
    </section>
  );
}

function PersonTab({
  person,
  setPerson,
  variant,
  onSplitChange,
  onTakesLeaveChange,
}: {
  person: PersonRow;
  setPerson: (fn: (prev: PersonRow) => PersonRow) => void;
  variant: 'birthing' | 'partner';
  onSplitChange?: (partnerWeeks: number) => void;
  onTakesLeaveChange?: (takes: boolean) => void;
}) {
  const i = variant === 'birthing' ? 0 : 1;
  const set = <K extends keyof PersonRow>(key: K, value: PersonRow[K]) =>
    setPerson((prev) => ({ ...prev, [key]: value }));
  const setExtra = (key: string, value: boolean) =>
    setPerson((prev) => ({ ...prev, extra: { ...(prev.extra ?? {}), [key]: value } }));

  const employed = person.employment !== 'unemployed';
  const isEmployee = person.employment === 'employee' || person.employment === 'both';
  const isSelf = person.employment === 'self_employed' || person.employment === 'both';
  const source = person.input_sources ?? {};

  return (
    <section className={s.form}>
      <p className={s.formIntro}>
        {variant === 'birthing'
          ? 'סוג ההעסקה קובע אילו טפסים צריך, וההכנסה קובעת את גובה דמי הלידה.'
          : 'גם בן/בת הזוג זכאי/ת לחלק מהתקופה ולחמשת ימי ההיעדרות הראשונים.'}
      </p>

      <div className={s.grid2}>
        <Field label="שם">
          <input
            className={s.input}
            value={person.display_name ?? ''}
            placeholder={variant === 'birthing' ? 'איך לקרוא לה בתיק' : 'איך לקרוא לו/לה בתיק'}
            onChange={(e) => set('display_name', e.target.value || null)}
          />
        </Field>

        <Field label="סוג העסקה">
          <select
            className={s.input}
            value={person.employment}
            onChange={(e) => set('employment', e.target.value as EmploymentType)}
          >
            {(Object.keys(EMPLOYMENT_LABELS) as EmploymentType[]).map((key) => (
              <option key={key} value={key}>{EMPLOYMENT_LABELS[key][i]}</option>
            ))}
          </select>
        </Field>

        {employed && (
          <Field label="שם המעסיק" hint="לא חובה — עוזר לזהות טפסים">
            <input
              className={s.input}
              value={person.employer_name ?? ''}
              onChange={(e) => set('employer_name', e.target.value || null)}
            />
          </Field>
        )}

        {isEmployee && (
          <Field
            label="שכר ברוטו חודשי"
            hint="ממוצע 3 החודשים שקדמו להפסקת העבודה"
            source={source.monthlyGross}
          >
            <div className={s.currency}>
              <input
                type="number"
                min={0}
                className={s.input}
                value={person.monthly_gross ?? ''}
                onChange={(e) =>
                  set('monthly_gross', e.target.value === '' ? null : Number(e.target.value))
                }
              />
              <span className={s.currencySign}>₪</span>
            </div>
          </Field>
        )}

        {isSelf && (
          <Field
            label="הכנסה שנתית לפי שומה"
            hint="הגבוהה מבין שתי השומות האחרונות"
            source={source.annualSelfEmployedIncome}
          >
            <div className={s.currency}>
              <input
                type="number"
                min={0}
                className={s.input}
                value={person.annual_self_employed_income ?? ''}
                onChange={(e) =>
                  set(
                    'annual_self_employed_income',
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
              />
              <span className={s.currencySign}>₪</span>
            </div>
          </Field>
        )}

        {employed && (
          <>
            <Field label="יום הפסקת העבודה" hint="״היום הקובע״ — קריטי לטופס 360">
              <input
                type="date"
                className={s.input}
                value={person.work_stop_date ?? ''}
                onChange={(e) => set('work_stop_date', e.target.value || null)}
              />
            </Field>

            <Field label="חודשי ביטוח מתוך 14" hint="קובע זכאות מלאה מול חלקית">
              <input
                type="number"
                min={0}
                max={14}
                className={s.input}
                value={person.insured_months_of_14 ?? ''}
                onChange={(e) =>
                  set('insured_months_of_14', e.target.value === '' ? null : Number(e.target.value))
                }
              />
            </Field>

            <Field label="חודשי ביטוח מתוך 22" hint="מסלול זכאות חלופי">
              <input
                type="number"
                min={0}
                max={22}
                className={s.input}
                value={person.insured_months_of_22 ?? ''}
                onChange={(e) =>
                  set('insured_months_of_22', e.target.value === '' ? null : Number(e.target.value))
                }
              />
            </Field>
          </>
        )}
      </div>

      {variant === 'partner' && (
        <div className={s.subBlock}>
          <label className={s.check}>
            <input
              type="checkbox"
              checked={person.takes_leave}
              onChange={(e) => onTakesLeaveChange?.(e.target.checked)}
            />
            <span>לוקח/ת חלק מתקופת הלידה וההורות</span>
          </label>

          {person.takes_leave && (
            <Field
              label={`חלוקה: ${15 - (person.leave_weeks ?? 0)} שבועות ליולדת, ${person.leave_weeks ?? 0} לבן/בת הזוג`}
              hint="היולדת חייבת מינימום 6 שבועות"
            >
              <input
                type="range"
                min={0}
                max={9}
                value={person.leave_weeks ?? 0}
                onChange={(e) => onSplitChange?.(Number(e.target.value))}
                className={s.range}
              />
            </Field>
          )}

          <label className={s.check}>
            <input
              type="checkbox"
              checked={person.has_employer_policy}
              onChange={(e) => set('has_employer_policy', e.target.checked)}
            />
            <span>יש ביטוח בריאות קולקטיבי דרך המעסיק</span>
          </label>

          <label className={s.check}>
            <input
              type="checkbox"
              checked={person.sick_paid_from_day_one}
              onChange={(e) => set('sick_paid_from_day_one', e.target.checked)}
            />
            <span>החוזה משלם 100% מיום מחלה ראשון</span>
          </label>
          <p className={s.hint}>
            שווה לבדוק בהסכם — זה משנה משמעותית את התשלום על חמשת ימי ההיעדרות.
          </p>
        </div>
      )}

      <div className={s.subBlock}>
        <p className={s.subTitle}>נכות מוכרת</p>
        <p className={s.hint}>
          פותח זכויות שרוב האנשים לא יודעים עליהן — חלקן לא ניתנות אוטומטית ודורשות בקשה יזומה.
        </p>
        <label className={s.check}>
          <input
            type="checkbox"
            checked={person.extra?.hasDisabilityBL ?? false}
            onChange={(e) => setExtra('hasDisabilityBL', e.target.checked)}
          />
          <span>נכות כללית מביטוח לאומי</span>
        </label>
        <label className={s.check}>
          <input
            type="checkbox"
            checked={person.extra?.hasDisabilityMOD ?? false}
            onChange={(e) => setExtra('hasDisabilityMOD', e.target.checked)}
          />
          <span>נכות מוכרת באגף השיקום (משרד הביטחון)</span>
        </label>
        <label className={s.check}>
          <input
            type="checkbox"
            checked={person.extra?.hasDisabilityWorkInjury ?? false}
            onChange={(e) => setExtra('hasDisabilityWorkInjury', e.target.checked)}
          />
          <span>נכות מעבודה</span>
        </label>
      </div>
    </section>
  );
}

function DocumentsTab({
  caseId,
  hasCase,
  docKinds,
  onUploaded,
}: {
  caseId: string;
  hasCase: boolean;
  docKinds: string[];
  onUploaded: (kind: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const present = new Set(docKinds);

  async function upload(kind: string, file: File) {
    setError('');
    if (file.size > MAX_BYTES) {
      setError(`הקובץ גדול מדי (${(file.size / 1048576).toFixed(1)}MB). המגבלה 15MB.`);
      return;
    }
    if (!ALLOWED.includes(file.type)) {
      setError('סוג קובץ לא נתמך. אפשר PDF או תמונה.');
      return;
    }

    setBusy(kind);
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const safeName = file.name.replace(/[^\w.\-֐-׿ ]/g, '_').slice(-80);
      const path = `case/${caseId}/${crypto.randomUUID()}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from('case-docs')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId,
          kind,
          storagePath: path,
          filename: safeName,
          mime: file.type,
          size: file.size,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'רישום המסמך נכשל');
      onUploaded(kind);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ההעלאה נכשלה');
    } finally {
      setBusy(null);
    }
  }

  if (!hasCase) {
    return (
      <section className={s.form}>
        <p className={s.formIntro}>
          העלאת מסמכים תיפתח אחרי שיוזן תאריך הלידה המשוער בטאב ״הלידה״ — המסמכים נשמרים בתוך
          התיק, והתיק נוצר מהתאריך הזה.
        </p>
      </section>
    );
  }

  return (
    <section className={s.form}>
      <p className={s.formIntro}>
        הקבצים נשמרים מוצפנים ונגישים רק לכם. הם לא נשלחים לאף גורם, ואף מסמך לא מקבל כתובת
        ציבורית — ההורדה היא דרך קישור זמני בלבד.
      </p>

      <div className={s.docs}>
        {DOCUMENT_KINDS.map((d) => {
          const uploaded = present.has(d.kind);
          return (
            <div key={d.kind} className={s.docSlot} data-done={uploaded}>
              <div className={s.docHead}>
                <span className={s.docCheck} aria-hidden>{uploaded ? '✓' : ''}</span>
                <div>
                  <p className={s.docLabel}>
                    {d.label}
                    {d.required && <span className={s.docReq}>נדרש</span>}
                  </p>
                  <p className={s.hint}>{d.hint}</p>
                </div>
              </div>
              <label className={s.docBtn}>
                {busy === d.kind ? 'מעלה…' : uploaded ? 'החלפה' : 'העלאה'}
                <input
                  type="file"
                  accept=".pdf,image/*"
                  hidden
                  disabled={busy !== null}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(d.kind, file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          );
        })}
      </div>

      {error && <p className={s.errorInline}>{error}</p>}
    </section>
  );
}

function SummaryTab({
  entitlements,
  sections,
  hasCase,
}: {
  entitlements: EntitlementResult | null;
  sections: { label: string; percent: number; missing: string[] }[];
  hasCase: boolean;
}) {
  if (!entitlements) {
    return (
      <section className={s.form}>
        <p className={s.formIntro}>
          החישוב ייפתח ברגע שיוזן תאריך לידה משוער בטאב ״הלידה״. כל תאריך במערכת נגזר ממנו,
          ובלעדיו אין מה לחשב.
        </p>
      </section>
    );
  }

  const incomplete = sections.filter((x) => x.percent < 100);

  return (
    <section className={s.form}>
      <div className={s.totalBox}>
        <p className={s.totalLbl}>הערכת סך הזכויות</p>
        <p className={s.totalNum}>
          {entitlements.total.toLocaleString('he-IL', { maximumFractionDigits: 0 })} ₪
        </p>
        <p className={s.hint}>ברוטו, לפני ניכויים</p>
      </div>

      <div className={s.lines}>
        {entitlements.lines.map((l) => (
          <div key={l.key} className={s.line}>
            <div>
              <p className={s.lineLabel}>{l.label}</p>
              <p className={s.lineFormula}>{l.formula}</p>
            </div>
            <strong className={s.lineAmount} data-c={l.confidence}>
              {l.amount == null
                ? '—'
                : `${l.amount.toLocaleString('he-IL', { maximumFractionDigits: 0 })} ₪`}
            </strong>
          </div>
        ))}
      </div>

      {incomplete.length > 0 && (
        <div className={s.missingBox}>
          <p className={s.subTitle}>מה עוד יחדד את החישוב</p>
          <ul className={s.missingList}>
            {incomplete.map((x) => (
              <li key={x.label}>
                <strong>{x.label}</strong> ({x.percent}%) — {x.missing.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasCase && (
        <a href="/case" className="btn btn-primary">
          למשימות וללוח הזמנים
        </a>
      )}

      <p className={s.disclaimer}>{entitlements.disclaimer}</p>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// רכיבי עזר
// ─────────────────────────────────────────────────────────────
function Field({
  label,
  hint,
  source,
  children,
}: {
  label: string;
  hint?: string;
  source?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={s.field}>
      <span className={s.label}>
        {label}
        {source === 'document' && <span className={s.sourceTag}>נקרא ממסמך</span>}
      </span>
      {children}
      {hint && <span className={s.hint}>{hint}</span>}
    </label>
  );
}

function Ring({ percent }: { percent: number }) {
  const r = 34;
  const circumference = 2 * Math.PI * r;
  return (
    <div className={s.ring}>
      <svg width="86" height="86" viewBox="0 0 86 86" aria-hidden>
        <circle cx="43" cy="43" r={r} className={s.ringTrack} />
        <circle
          cx="43"
          cy="43"
          r={r}
          className={s.ringFill}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent / 100)}
        />
      </svg>
      <span className={s.ringNum}>{percent}%</span>
      <span className="sr-only">{percent} אחוז מהנתונים הושלמו</span>
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  const text = {
    idle: 'כל שינוי נשמר אוטומטית',
    saving: 'שומר…',
    saved: 'נשמר',
    error: 'השמירה נכשלה',
  }[state];
  return <span className={s.saveBadge} data-state={state}>{text}</span>;
}
