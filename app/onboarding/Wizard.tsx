'use client';

import { useState } from 'react';
import type { EmploymentType } from '@/lib/engine/types';
import { addWeeks } from '@/lib/engine/schedule';
import s from './wizard.module.css';

const HMOS = ['כללית', 'מכבי', 'מאוחדת', 'לאומית'];
const TOTAL_WEEKS = 15;

type Role = 'birthing_parent' | 'partner';

interface Draft {
  fullName: string;
  phone: string;
  myRole: Role | null;
  dueDate: string;
  birthOrder: number;
  multipleBirth: boolean;
  hmo: string;
  employment: EmploymentType;
  monthlyGross: string;
  annualIncome: string;
  insuredMonths: string;
  workStopDate: string;
  otherName: string;
  otherEmployment: EmploymentType;
  partnerTakesLeave: boolean;
  partnerWeeks: number;
}

const STEPS = ['מי אני', 'הלידה', 'התעסוקה שלי', 'בן/בת הזוג', 'סיום'];

export default function Wizard({ initial }: { initial: Partial<Draft> }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [d, setD] = useState<Draft>({
    fullName: '',
    phone: '',
    myRole: null,
    dueDate: '',
    birthOrder: 1,
    multipleBirth: false,
    hmo: '',
    employment: 'employee',
    monthlyGross: '',
    annualIncome: '',
    insuredMonths: '',
    workStopDate: '',
    otherName: '',
    otherEmployment: 'employee',
    partnerTakesLeave: true,
    partnerWeeks: 0,
    ...initial,
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setD((prev) => ({ ...prev, [key]: value }));

  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  /** מי אני קובע לאיזו שורה נכנסים הנתונים שלי ולאיזו של השני. */
  const mine = d.myRole === 'partner' ? 'partner' : 'birthing';
  const theirs = mine === 'partner' ? 'birthing' : 'partner';

  /** שומר את מה שהצטבר עד כה. נקרא בכל מעבר שלב, כדי ששום שלב לא ילך לאיבוד. */
  async function persist(upTo: number) {
    const body: Record<string, unknown> = {};

    if (upTo >= 1) {
      body.me = { fullName: d.fullName || null, phone: d.phone || null };
      if (d.myRole) body.myRole = d.myRole;
    }
    if (upTo >= 2) {
      body.case = {
        dueDate: d.dueDate || null,
        birthOrder: d.birthOrder,
        multipleBirth: d.multipleBirth,
        hmo: d.hmo || null,
      };
    }
    if (upTo >= 3) {
      body[mine] = {
        displayName: d.fullName || null,
        employment: d.employment,
        monthlyGross: num(d.monthlyGross),
        annualSelfEmployedIncome: num(d.annualIncome),
        insuredMonthsOf24: num(d.insuredMonths),
        workStopDate: d.workStopDate || null,
      };
    }
    if (upTo >= 4) {
      const partnerSide = {
        displayName: d.otherName || null,
        employment: d.otherEmployment,
      } as Record<string, unknown>;

      // חלוקת השבועות נרשמת לשני הצדדים יחד — רישום צד אחד בלבד
      // גורם למנוע להגביל את בן/בת הזוג לאפס
      body[theirs] = { ...(body[theirs] as object), ...partnerSide };
      body.partner = {
        ...(body.partner as object),
        takesLeave: d.partnerTakesLeave,
        leaveWeeks: d.partnerTakesLeave ? d.partnerWeeks : 0,
      };
      body.birthing = {
        ...(body.birthing as object),
        leaveWeeks: d.partnerTakesLeave ? TOTAL_WEEKS - d.partnerWeeks : TOTAL_WEEKS,
      };
    }

    const res = await fetch('/api/case/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok && res.status !== 207) throw new Error(json.error ?? 'השמירה נכשלה');
    return json;
  }

  async function next() {
    setError('');
    setSaving(true);
    try {
      await persist(step + 1);
      setStep((prev) => Math.min(prev + 1, STEPS.length - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  }

  const canAdvance = [
    d.myRole !== null,
    Boolean(d.dueDate),
    true,
    true,
    true,
  ][step];

  const isEmployee = d.employment === 'employee' || d.employment === 'both';
  const isSelf = d.employment === 'self_employed' || d.employment === 'both';
  const meLabel = d.myRole === 'partner' ? 'בן/בת הזוג' : 'היולדת';
  const otherLabel = d.myRole === 'partner' ? 'היולדת' : 'בן/בת הזוג';

  return (
    <main id="main" className={s.page}>
      <div className={s.card}>
        <a href="/account" className={s.skip}>דילוג לאזור האישי ←</a>

        <div className={s.steps}>
          {STEPS.map((label, i) => (
            <div key={label} className={s.stepChip} data-state={i === step ? 'now' : i < step ? 'done' : 'next'}>
              <span className={s.stepDot}>{i < step ? '✓' : i + 1}</span>
              <span className={s.stepLabel}>{label}</span>
            </div>
          ))}
        </div>
        <div className={s.bar}>
          <div className={s.barFill} style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} />
        </div>

        {step === 0 && (
          <section className={s.section}>
            <h1 className={s.title}>קודם כול — מי אתם?</h1>
            <p className={s.sub}>
              השאלה החשובה כאן היא מי מכם יולד/ת. ממנה נגזר מי מקבל אילו משימות,
              ומי צריך להגיש איזה טופס.
            </p>

            <label className={s.field}>
              <span className={s.label}>שם מלא</span>
              <input className={s.input} value={d.fullName} onChange={(e) => set('fullName', e.target.value)} />
            </label>

            <label className={s.field}>
              <span className={s.label}>טלפון</span>
              <input
                type="tel"
                dir="ltr"
                className={s.input}
                value={d.phone}
                placeholder="050-0000000"
                onChange={(e) => set('phone', e.target.value)}
              />
              <span className={s.hint}>לתזכורות בלבד. לא נשלח לאף גורם חיצוני.</span>
            </label>

            <div className={s.roles}>
              {([
                ['birthing_parent', 'אני היולדת'],
                ['partner', 'אני בן/בת הזוג'],
              ] as const).map(([role, label]) => (
                <button
                  key={role}
                  type="button"
                  className={s.role}
                  data-active={d.myRole === role}
                  aria-pressed={d.myRole === role}
                  onClick={() => set('myRole', role)}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 1 && (
          <section className={s.section}>
            <h1 className={s.title}>מתי זה קורה?</h1>
            <p className={s.sub}>
              כל תאריך במערכת נגזר מכאן. אחרי הלידה מעדכנים לתאריך בפועל, והכול זז יחד.
            </p>

            <label className={s.field}>
              <span className={s.label}>תאריך לידה משוער</span>
              <input type="date" className={s.input} value={d.dueDate} onChange={(e) => set('dueDate', e.target.value)} required />
            </label>

            <label className={s.field}>
              <span className={s.label}>איזה ילד</span>
              <select className={s.input} value={d.birthOrder} onChange={(e) => set('birthOrder', Number(e.target.value))}>
                <option value={1}>ראשון</option>
                <option value={2}>שני</option>
                <option value={3}>שלישי ואילך</option>
              </select>
              <span className={s.hint}>קובע את גובה מענק הלידה.</span>
            </label>

            <label className={s.field}>
              <span className={s.label}>קופת חולים</span>
              <select className={s.input} value={d.hmo} onChange={(e) => set('hmo', e.target.value)}>
                <option value="">לא לציין</option>
                {HMOS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>

            <label className={s.check}>
              <input type="checkbox" checked={d.multipleBirth} onChange={(e) => set('multipleBirth', e.target.checked)} />
              <span>לידה מרובת עוברים</span>
            </label>
          </section>
        )}

        {step === 2 && (
          <section className={s.section}>
            <h1 className={s.title}>התעסוקה שלך</h1>
            <p className={s.sub}>
              מכאן מגיעים דמי הלידה. אפשר לדלג ולהשלים אחר כך — פשוט תראו ״—״ במקום סכום.
            </p>

            <label className={s.field}>
              <span className={s.label}>סוג העסקה</span>
              <select className={s.input} value={d.employment} onChange={(e) => set('employment', e.target.value as EmploymentType)}>
                <option value="employee">שכיר/ה</option>
                <option value="self_employed">עצמאי/ת</option>
                <option value="both">שכיר/ה וגם עצמאי/ת</option>
                <option value="unemployed">לא עובד/ת</option>
              </select>
            </label>

            {isEmployee && (
              <label className={s.field}>
                <span className={s.label}>שכר ברוטו חודשי</span>
                <input type="number" min={0} className={s.input} value={d.monthlyGross} onChange={(e) => set('monthlyGross', e.target.value)} />
                <span className={s.hint}>ממוצע 3 החודשים שקדמו להפסקת העבודה.</span>
              </label>
            )}

            {isSelf && (
              <label className={s.field}>
                <span className={s.label}>הכנסה שנתית לפי שומה</span>
                <input type="number" min={0} className={s.input} value={d.annualIncome} onChange={(e) => set('annualIncome', e.target.value)} />
                <span className={s.hint}>הגבוהה מבין שתי השומות האחרונות.</span>
              </label>
            )}

            {d.employment !== 'unemployed' && (
              <>
                <label className={s.field}>
                  <span className={s.label}>חודשי ביטוח בשנתיים האחרונות</span>
                  <input type="number" min={0} max={24} className={s.input} value={d.insuredMonths} onChange={(e) => set('insuredMonths', e.target.value)} />
                  <span className={s.hint}>
                    כמה חודשים עבדתם או הייתם מבוטחים ב-24 החודשים האחרונים. ביטוח לאומי
                    בודק חלון צר יותר, ולכן זו הערכה שתסומן ככזו.
                  </span>
                </label>

                <label className={s.field}>
                  <span className={s.label}>יום הפסקת העבודה</span>
                  <input type="date" className={s.input} value={d.workStopDate} onChange={(e) => set('workStopDate', e.target.value)} />
                  <span className={s.hint}>״היום הקובע״. קריטי לטופס 360.</span>
                </label>
              </>
            )}
          </section>
        )}

        {step === 3 && (
          <section className={s.section}>
            <h1 className={s.title}>ו{otherLabel}?</h1>
            <p className={s.sub}>
              {d.myRole === 'partner'
                ? 'הפרטים של היולדת, ואיך מתחלקת בין שניכם תקופת ה-15 שבועות.'
                : 'אפשר להזמין אותם לתיק בהמשך, והם יראו את אותה רשימה ואת אותה התקדמות.'}
            </p>

            <label className={s.field}>
              <span className={s.label}>שם</span>
              <input className={s.input} value={d.otherName} onChange={(e) => set('otherName', e.target.value)} />
            </label>

            <label className={s.field}>
              <span className={s.label}>סוג העסקה</span>
              <select className={s.input} value={d.otherEmployment} onChange={(e) => set('otherEmployment', e.target.value as EmploymentType)}>
                <option value="employee">שכיר/ה</option>
                <option value="self_employed">עצמאי/ת</option>
                <option value="both">שכיר/ה וגם עצמאי/ת</option>
                <option value="unemployed">לא עובד/ת</option>
              </select>
            </label>

            <label className={s.check}>
              <input
                type="checkbox"
                checked={d.partnerTakesLeave}
                onChange={(e) => set('partnerTakesLeave', e.target.checked)}
              />
              <span>
                {d.myRole === 'partner'
                  ? 'אקח חלק מתקופת הלידה וההורות'
                  : 'בן/בת הזוג ייקח/תיקח חלק מתקופת הלידה'}
              </span>
            </label>

            {d.partnerTakesLeave && (
              <label className={s.field}>
                <span className={s.label}>
                  חלוקה: {TOTAL_WEEKS - d.partnerWeeks} שבועות ליולדת, {d.partnerWeeks} לבן/בת הזוג
                </span>
                <input
                  type="range"
                  min={0}
                  max={9}
                  value={d.partnerWeeks}
                  onChange={(e) => set('partnerWeeks', Number(e.target.value))}
                  className={s.range}
                />
                {d.dueDate && (
                  <span className={s.dates}>
                    היולדת עד {fmt(addWeeks(d.dueDate, TOTAL_WEEKS - d.partnerWeeks))}
                    {d.partnerWeeks > 0 && (
                      <>
                        {' · '}בן/בת הזוג עד{' '}
                        {fmt(addWeeks(addWeeks(d.dueDate, TOTAL_WEEKS - d.partnerWeeks), d.partnerWeeks))}
                      </>
                    )}
                  </span>
                )}
              </label>
            )}
          </section>
        )}

        {step === 4 && (
          <section className={s.section}>
            <h1 className={s.title}>זהו. התיק נבנה.</h1>
            <p className={s.sub}>
              המשימות, התאריכים והסכומים מחושבים מהתשובות שלכם. ככל שתשלימו עוד נתונים
              באזור האישי — הסכומים מדויקים יותר.
            </p>

            <ul className={s.summary}>
              <li><strong>{meLabel}</strong> — {d.fullName || 'בלי שם'}</li>
              {d.dueDate && <li><strong>תאריך משוער</strong> — {fmt(d.dueDate)}</li>}
              {d.hmo && <li><strong>קופה</strong> — {d.hmo}</li>}
              <li>
                <strong>חלוקת התקופה</strong> — {TOTAL_WEEKS - (d.partnerTakesLeave ? d.partnerWeeks : 0)} שבועות
                ליולדת{d.partnerTakesLeave && d.partnerWeeks > 0 ? `, ${d.partnerWeeks} לבן/בת הזוג` : ''}
              </li>
            </ul>

            <div className={s.finish}>
              <a href="/case" className="btn btn-primary">למשימות וללוח הזמנים</a>
              <a href="/account" className="btn btn-ghost">לאזור האישי</a>
            </div>
          </section>
        )}

        {error && <p className={s.error}>{error}</p>}

        {step < STEPS.length - 1 && (
          <div className={s.actions}>
            {step > 0 && (
              <button onClick={() => setStep(step - 1)} className="btn btn-ghost" disabled={saving}>
                חזרה
              </button>
            )}
            <button onClick={next} className="btn btn-primary" disabled={!canAdvance || saving}>
              {saving ? 'שומר…' : step === STEPS.length - 2 ? 'סיום' : 'לשלב הבא'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function fmt(d: string) {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
