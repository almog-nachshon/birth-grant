'use client';

import { useState } from 'react';
import type { EmploymentType } from '@/lib/engine/types';
import s from './onboarding.module.css';

const HMOS = ['כללית', 'מכבי', 'מאוחדת', 'לאומית'];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [dueDate, setDueDate] = useState('');
  const [birthOrder, setBirthOrder] = useState<1 | 2 | 3>(1);
  const [multipleBirth, setMultiple] = useState(false);
  const [hmo, setHmo] = useState('');

  const [bName, setBName] = useState('');
  const [bEmployment, setBEmployment] = useState<EmploymentType>('employee');
  const [bDisBL, setBDisBL] = useState(false);
  const [bDisMOD, setBDisMOD] = useState(false);

  const [pName, setPName] = useState('');
  const [pEmployment, setPEmployment] = useState<EmploymentType>('employee');
  const [pTakes, setPTakes] = useState(true);
  const [bWeeks, setBWeeks] = useState(6);
  const [pPolicy, setPPolicy] = useState(false);
  const [pDisBL, setPDisBL] = useState(false);
  const [pDisMOD, setPDisMOD] = useState(false);

  const steps = ['הלידה', 'היולדת', 'בן/בת הזוג'];

  async function submit() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/case/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dueDate,
          birthOrder,
          multipleBirth,
          hmo: hmo || undefined,
          birthing: {
            displayName: bName || undefined,
            employment: bEmployment,
            takesLeave: true,
            leaveWeeks: pTakes ? bWeeks : 15,
            hasDisabilityBL: bDisBL,
            hasDisabilityMOD: bDisMOD,
          },
          partner: {
            displayName: pName || undefined,
            employment: pEmployment,
            takesLeave: pTakes,
            leaveWeeks: pTakes ? 15 - bWeeks : 0,
            hasEmployerPolicy: pPolicy,
            hasDisabilityBL: pDisBL,
            hasDisabilityMOD: pDisMOD,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'שמירה נכשלה');
      window.location.href = '/case';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שמירה נכשלה');
      setSaving(false);
    }
  }

  const canProceed = step === 0 ? Boolean(dueDate) : true;

  return (
    <main className={s.page}>
      <div className={s.card}>
        <div className={s.progress}>
          {steps.map((label, i) => (
            <div key={label} className={s.progressStep} data-active={i <= step}>
              <span className={s.progressDot}>{i + 1}</span>
              <span className={s.progressLabel}>{label}</span>
            </div>
          ))}
        </div>

        {step === 0 && (
          <section className={s.section}>
            <h1 className={s.title}>מתי זה קורה?</h1>
            <p className={s.sub}>
              כל התאריכים בתיק נגזרים מכאן. אפשר לעדכן לתאריך בפועל אחרי הלידה והכול יזוז.
            </p>

            <label className={s.field}>
              <span className={s.label}>תאריך לידה משוער</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={s.input} required />
            </label>

            <label className={s.field}>
              <span className={s.label}>איזה ילד</span>
              <select value={birthOrder} onChange={(e) => setBirthOrder(Number(e.target.value) as 1 | 2 | 3)} className={s.input}>
                <option value={1}>ראשון</option>
                <option value={2}>שני</option>
                <option value={3}>שלישי ואילך</option>
              </select>
            </label>

            <label className={s.field}>
              <span className={s.label}>קופת חולים</span>
              <select value={hmo} onChange={(e) => setHmo(e.target.value)} className={s.input}>
                <option value="">לא לציין</option>
                {HMOS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <span className={s.hint}>משפיע על החזרי מלונית וסל הריון.</span>
            </label>

            <label className={s.check}>
              <input type="checkbox" checked={multipleBirth} onChange={(e) => setMultiple(e.target.checked)} />
              <span>לידה מרובת עוברים</span>
            </label>
          </section>
        )}

        {step === 1 && (
          <section className={s.section}>
            <h1 className={s.title}>מי היולדת?</h1>
            <p className={s.sub}>
              סוג ההעסקה קובע אילו טפסים צריך ואיך מחושבים דמי הלידה.
            </p>

            <label className={s.field}>
              <span className={s.label}>שם (לא חובה)</span>
              <input value={bName} onChange={(e) => setBName(e.target.value)} className={s.input} placeholder="איך לקרוא לה בתיק" />
            </label>

            <label className={s.field}>
              <span className={s.label}>סוג העסקה</span>
              <select value={bEmployment} onChange={(e) => setBEmployment(e.target.value as EmploymentType)} className={s.input}>
                <option value="employee">שכירה</option>
                <option value="self_employed">עצמאית</option>
                <option value="both">שכירה וגם עצמאית</option>
                <option value="unemployed">לא עובדת</option>
              </select>
            </label>

            <div className={s.disability}>
              <p className={s.disabilityTitle}>נכות מוכרת</p>
              <p className={s.hint}>
                פותח זכויות שרוב האנשים לא יודעים עליהן — חלקן לא ניתנות אוטומטית ודורשות בקשה יזומה.
              </p>
              <label className={s.check}>
                <input type="checkbox" checked={bDisBL} onChange={(e) => setBDisBL(e.target.checked)} />
                <span>נכות כללית מביטוח לאומי</span>
              </label>
              <label className={s.check}>
                <input type="checkbox" checked={bDisMOD} onChange={(e) => setBDisMOD(e.target.checked)} />
                <span>נכות מוכרת באגף השיקום (משרד הביטחון)</span>
              </label>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className={s.section}>
            <h1 className={s.title}>ובן/בת הזוג?</h1>
            <p className={s.sub}>
              אפשר להזמין אותם לתיק אחרי שנסיים, והם יראו את אותה רשימה.
            </p>

            <label className={s.field}>
              <span className={s.label}>שם (לא חובה)</span>
              <input value={pName} onChange={(e) => setPName(e.target.value)} className={s.input} />
            </label>

            <label className={s.field}>
              <span className={s.label}>סוג העסקה</span>
              <select value={pEmployment} onChange={(e) => setPEmployment(e.target.value as EmploymentType)} className={s.input}>
                <option value="employee">שכיר/ה</option>
                <option value="self_employed">עצמאי/ת</option>
                <option value="both">שכיר/ה וגם עצמאי/ת</option>
                <option value="unemployed">לא עובד/ת</option>
              </select>
            </label>

            <label className={s.check}>
              <input type="checkbox" checked={pTakes} onChange={(e) => setPTakes(e.target.checked)} />
              <span>מתכננים שהוא/היא ייקח/תיקח חלק מהתקופה</span>
            </label>

            {pTakes && (
              <label className={s.field}>
                <span className={s.label}>
                  חלוקה: {bWeeks} שבועות ליולדת, {15 - bWeeks} לבן/בת הזוג
                </span>
                <input type="range" min={6} max={15} value={bWeeks} onChange={(e) => setBWeeks(Number(e.target.value))} className={s.range} />
                <span className={s.hint}>היולדת חייבת מינימום 6 שבועות. אפשר לשנות בהמשך.</span>
              </label>
            )}

            <label className={s.check}>
              <input type="checkbox" checked={pPolicy} onChange={(e) => setPPolicy(e.target.checked)} />
              <span>יש ביטוח בריאות קולקטיבי דרך המעסיק</span>
            </label>

            <div className={s.disability}>
              <p className={s.disabilityTitle}>נכות מוכרת</p>
              <label className={s.check}>
                <input type="checkbox" checked={pDisBL} onChange={(e) => setPDisBL(e.target.checked)} />
                <span>נכות כללית מביטוח לאומי</span>
              </label>
              <label className={s.check}>
                <input type="checkbox" checked={pDisMOD} onChange={(e) => setPDisMOD(e.target.checked)} />
                <span>נכות מוכרת באגף השיקום</span>
              </label>
            </div>
          </section>
        )}

        {error && <p className={s.error}>{error}</p>}

        <div className={s.actions}>
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="btn btn-ghost" disabled={saving}>
              חזרה
            </button>
          )}
          {step < 2 ? (
            <button onClick={() => setStep(step + 1)} className="btn btn-primary" disabled={!canProceed}>
              המשך
            </button>
          ) : (
            <button onClick={submit} className="btn btn-primary" disabled={saving}>
              {saving ? 'בונה את התיק…' : 'יצירת התיק'}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
