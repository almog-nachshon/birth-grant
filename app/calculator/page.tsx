'use client';

import { useMemo, useState } from 'react';
import { calculateEntitlements } from '@/lib/engine/entitlements';
import { buildSchedule, resolveLeaveSplit } from '@/lib/engine/schedule';
import type { CaseProfile, EmploymentType } from '@/lib/engine/types';
import { lastUpdated, ratesAt } from '@/lib/rates';
import s from './calculator.module.css';

const RATES = ratesAt();

const CONFIDENCE_LABEL: Record<string, string> = {
  calculated: 'מחושב',
  estimated: 'הערכה',
  needs_input: 'חסר נתון',
  unverifiable: 'לא ניתן לחישוב',
};

export default function CalculatorPage() {
  const [dueDate, setDueDate] = useState('');
  const [birthOrder, setBirthOrder] = useState<1 | 2 | 3>(1);
  const [multipleBirth, setMultiple] = useState(false);

  const [bEmployment, setBEmployment] = useState<EmploymentType>('employee');
  const [bIncome, setBIncome] = useState('');
  const [bWeeks, setBWeeks] = useState(15);

  const [pTakes, setPTakes] = useState(false);
  const [pEmployment, setPEmployment] = useState<EmploymentType>('employee');
  const [pGross, setPGross] = useState('');
  const [pSickDayOne, setPSickDayOne] = useState(false);

  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

  const profile: CaseProfile = useMemo(
    () => ({
      dueDate: dueDate || new Date().toISOString().slice(0, 10),
      birthOrder,
      multipleBirth,
      persons: [
        {
          role: 'birthing_parent',
          employment: bEmployment,
          takesLeave: true,
          leaveWeeks: bWeeks,
          ...(bEmployment === 'self_employed'
            ? { annualSelfEmployedIncome: num(bIncome) }
            : { monthlyGross: num(bIncome) }),
        },
        {
          role: 'partner',
          employment: pEmployment,
          takesLeave: pTakes,
          leaveWeeks: pTakes ? 15 - bWeeks : 0,
          monthlyGross: num(pGross),
          sickPaidFromDayOne: pSickDayOne,
        },
      ],
    }),
    [dueDate, birthOrder, multipleBirth, bEmployment, bIncome, bWeeks, pTakes, pEmployment, pGross, pSickDayOne],
  );

  const result = useMemo(() => calculateEntitlements(profile, RATES), [profile]);
  const split = useMemo(() => resolveLeaveSplit(profile, RATES), [profile]);
  const schedule = useMemo(() => (dueDate ? buildSchedule(profile, RATES) : []), [profile, dueDate]);

  return (
    <main className={s.page}>
      <div className={s.head}>
        <a href="/" className={s.back}>← לעמוד הבית</a>
        <h1 className={s.title}>בדיקה מהירה</h1>
        <p className={s.sub}>
          הערכה של מה שמגיע לכם, בלי הרשמה. לרשימת המשימות, התאריכים והמסמכים —{' '}
          <a href="/login">נדרשת כניסה</a>.
        </p>
      </div>

      <div className={s.grid}>
        {/* ── טופס ── */}
        <form className={s.form} onSubmit={(e) => e.preventDefault()}>
          <fieldset className={s.fieldset}>
            <legend className={s.legend}>הלידה</legend>

            <label className={s.field}>
              <span className={s.label}>תאריך לידה משוער</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={s.input}
              />
            </label>

            <label className={s.field}>
              <span className={s.label}>איזה ילד</span>
              <select
                value={birthOrder}
                onChange={(e) => setBirthOrder(Number(e.target.value) as 1 | 2 | 3)}
                className={s.input}
              >
                <option value={1}>ראשון</option>
                <option value={2}>שני</option>
                <option value={3}>שלישי ואילך</option>
              </select>
            </label>

            <label className={s.check}>
              <input type="checkbox" checked={multipleBirth} onChange={(e) => setMultiple(e.target.checked)} />
              <span>לידה מרובת עוברים</span>
            </label>
          </fieldset>

          <fieldset className={s.fieldset}>
            <legend className={s.legend}>היולדת</legend>

            <label className={s.field}>
              <span className={s.label}>סוג העסקה</span>
              <select
                value={bEmployment}
                onChange={(e) => setBEmployment(e.target.value as EmploymentType)}
                className={s.input}
              >
                <option value="employee">שכירה</option>
                <option value="self_employed">עצמאית</option>
                <option value="both">שכירה וגם עצמאית</option>
                <option value="unemployed">לא עובדת</option>
              </select>
            </label>

            <label className={s.field}>
              <span className={s.label}>
                {bEmployment === 'self_employed' ? 'הכנסה שנתית לפי השומה (₪)' : 'שכר ברוטו חודשי (₪)'}
              </span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={bIncome}
                onChange={(e) => setBIncome(e.target.value)}
                placeholder={bEmployment === 'self_employed' ? '120000' : '15000'}
                className={s.input}
              />
              <span className={s.hint}>
                {bEmployment === 'self_employed'
                  ? 'הגבוה מבין שתי השומות. מרואה החשבון.'
                  : 'ממוצע 3 החודשים שקדמו להפסקת העבודה.'}
              </span>
            </label>

            <label className={s.field}>
              <span className={s.label}>שבועות שהיא לוקחת: {bWeeks}</span>
              <input
                type="range"
                min={6}
                max={15}
                value={bWeeks}
                onChange={(e) => setBWeeks(Number(e.target.value))}
                className={s.range}
              />
              <span className={s.hint}>מינימום 6 שבועות חובה, מתוך מכסה משותפת של 15.</span>
            </label>
          </fieldset>

          <fieldset className={s.fieldset}>
            <legend className={s.legend}>בן/בת הזוג</legend>

            <label className={s.check}>
              <input type="checkbox" checked={pTakes} onChange={(e) => setPTakes(e.target.checked)} />
              <span>לוקח/ת את יתרת התקופה ({15 - bWeeks} שבועות)</span>
            </label>

            <label className={s.field}>
              <span className={s.label}>סוג העסקה</span>
              <select
                value={pEmployment}
                onChange={(e) => setPEmployment(e.target.value as EmploymentType)}
                className={s.input}
              >
                <option value="employee">שכיר/ה</option>
                <option value="self_employed">עצמאי/ת</option>
                <option value="both">שכיר/ה וגם עצמאי/ת</option>
                <option value="unemployed">לא עובד/ת</option>
              </select>
            </label>

            <label className={s.field}>
              <span className={s.label}>שכר ברוטו חודשי (₪)</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={pGross}
                onChange={(e) => setPGross(e.target.value)}
                placeholder="20000"
                className={s.input}
              />
            </label>

            <label className={s.check}>
              <input type="checkbox" checked={pSickDayOne} onChange={(e) => setPSickDayOne(e.target.checked)} />
              <span>החוזה משלם 100% מיום מחלה ראשון</span>
            </label>
          </fieldset>
        </form>

        {/* ── תוצאה ── */}
        <div className={s.results}>
          <div className={s.total}>
            <div className={s.totalNum}>
              {result.total.toLocaleString('he-IL', { maximumFractionDigits: 0 })} ₪
            </div>
            <div className={s.totalLbl}>סך מה שחושב, ברוטו לפני ניכויים</div>
          </div>

          {split.warnings.length > 0 && (
            <div className={s.warn}>
              {split.warnings.map((w, i) => <p key={i}>{w}</p>)}
            </div>
          )}

          {result.missingInputs.length > 0 && (
            <div className={s.missing}>
              <strong>כדי לדייק חסר:</strong>
              <ul>{result.missingInputs.map((m) => <li key={m}>{m}</li>)}</ul>
            </div>
          )}

          <div className={s.lines}>
            {result.lines.map((line) => (
              <details key={line.key} className={s.line}>
                <summary className={s.lineHead}>
                  <span className={s.lineLabel}>{line.label}</span>
                  <span className={s.lineAmount} data-c={line.confidence}>
                    {line.amount == null
                      ? '—'
                      : `${line.amount.toLocaleString('he-IL', { maximumFractionDigits: 0 })} ₪`}
                  </span>
                </summary>
                <div className={s.lineBody}>
                  <p className={s.badge} data-c={line.confidence}>
                    {CONFIDENCE_LABEL[line.confidence]}
                  </p>
                  <p className={s.formula}>{line.formula}</p>
                  {line.notes?.map((n, i) => <p key={i} className={s.note}>{n}</p>)}
                </div>
              </details>
            ))}
          </div>

          {schedule.length > 0 && (
            <div className={s.schedule}>
              <h2 className={s.schedTitle}>לוח זמנים</h2>
              {schedule.map((e) => (
                <div key={e.key} className={s.schedRow}>
                  <span>{e.label}</span>
                  <strong>{new Date(e.date).toLocaleDateString('he-IL')}</strong>
                </div>
              ))}
            </div>
          )}

          <p className={s.disclaimer}>
            {result.disclaimer} השיעורים עודכנו ב-{new Date(lastUpdated()).toLocaleDateString('he-IL')}.
          </p>

          <a href="/login" className={`btn btn-primary ${s.cta}`}>
            לרשימת המשימות והמסמכים →
          </a>
        </div>
      </div>
    </main>
  );
}
