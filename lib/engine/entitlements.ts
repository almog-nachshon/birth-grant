// מנוע החישוב הכספי.
//
// שני עקרונות שאסור להפר:
// 1. כל סכום מגיע מנוסחה מפורשת + טבלת השיעורים. אין מספרים קשיחים כאן.
// 2. מה שלא ניתן לחשב באמינות מקבל amount: null ו-confidence מתאים —
//    לעולם לא ניחוש שנראה כמו עובדה. זו הסיבה שהמנוע קיים ולא ה-AI.

import type { CaseProfile, EntitlementResult, MoneyLine, RateMap } from './types.ts';
import { resolveLeaveSplit } from './schedule.ts';

const round = (n: number) => Math.round(n * 100) / 100;
const ils = (n: number) => n.toLocaleString('he-IL', { maximumFractionDigits: 0 });

/**
 * דמי לידה ליום = ההכנסה ברבע השנה שקדם ליום הקובע חלקי 90, עד התקרה.
 * שכיר/ה: 3 חודשי ברוטו. עצמאי/ת: לפי השומה הגבוהה מבין השתיים.
 */
export function dailyAllowance(
  person: { employment: string; monthlyGross?: number; annualSelfEmployedIncome?: number },
  rates: RateMap,
): { daily: number | null; formula: string; capped: boolean } {
  const cap = rates.maternity_daily_cap ?? null;

  let quarterIncome: number | null = null;
  let source = '';

  if (person.employment === 'employee' || person.employment === 'both') {
    if (person.monthlyGross != null) {
      quarterIncome = person.monthlyGross * 3;
      source = `ברוטו חודשי ${ils(person.monthlyGross)} × 3 חודשים`;
    }
  }
  if (quarterIncome == null && (person.employment === 'self_employed' || person.employment === 'both')) {
    if (person.annualSelfEmployedIncome != null) {
      quarterIncome = person.annualSelfEmployedIncome / 4;
      source = `הכנסה שנתית ${ils(person.annualSelfEmployedIncome)} ÷ 4 (רבעון)`;
    }
  }

  if (quarterIncome == null) {
    return { daily: null, formula: 'חסר נתון הכנסה', capped: false };
  }

  const raw = quarterIncome / 90;
  const capped = cap != null && raw > cap;
  const daily = capped ? cap! : raw;

  return {
    daily: round(daily),
    formula: capped
      ? `${source} ÷ 90 = ${ils(raw)} ₪/יום — מעל התקרה, שולם לפי ${ils(cap!)} ₪/יום`
      : `${source} ÷ 90 = ${ils(raw)} ₪/יום`,
    capped,
  };
}

export function calculateEntitlements(profile: CaseProfile, rates: RateMap): EntitlementResult {
  const lines: MoneyLine[] = [];
  const missing: string[] = [];
  const split = resolveLeaveSplit(profile, rates);

  // ── מענק לידה ───────────────────────────────────────────
  const grantKey = profile.multipleBirth
    ? 'birth_grant_twins'
    : profile.birthOrder === 1
      ? 'birth_grant_first_child'
      : profile.birthOrder === 2
        ? 'birth_grant_second_child'
        : 'birth_grant_third_plus';
  const grant = rates[grantKey];
  lines.push({
    key: 'birth_grant',
    label: profile.multipleBirth ? 'מענק לידה — תאומים' : `מענק לידה — ילד ${profile.birthOrder}`,
    amount: grant ?? null,
    confidence: grant != null ? 'calculated' : 'needs_input',
    formula: 'סכום קבוע לפי מספר הילדים בלידה. לא תלוי בהכנסה או בסוג העסקה.',
    notes: ['משולם אוטומטית ליולדת אחרי דיווח בית החולים — לא נדרשת הגשה.'],
  });

  // ── דמי לידה לכל הורה ────────────────────────────────────
  for (const person of profile.persons) {
    const weeks = person.role === 'birthing_parent' ? split.birthingWeeks : split.partnerWeeks;
    if (weeks <= 0) continue;

    const roleLabel = person.role === 'birthing_parent' ? 'יולדת' : 'בן/בת זוג';
    const { daily, formula, capped } = dailyAllowance(person, rates);
    const days = weeks * 7; // ביטוח לאומי משלם לפי ימי לוח, לא ימי עבודה

    if (daily == null) {
      missing.push(
        person.employment === 'self_employed'
          ? `הכנסה שנתית לפי שומה — ${roleLabel}`
          : `שכר ברוטו חודשי — ${roleLabel}`,
      );
      lines.push({
        key: `maternity_${person.role}`,
        label: `דמי לידה — ${roleLabel} (${weeks} שבועות)`,
        amount: null,
        confidence: 'needs_input',
        formula: `${days} ימי לוח × תעריף יומי. ${formula}`,
      });
      continue;
    }

    // בדיקת תנאי סף — משפיעה על מספר השבועות בפועל
    const notes: string[] = [];
    const m14 = person.insuredMonthsOf14;
    const m22 = person.insuredMonthsOf22;
    const fullBy14 = m14 != null && m14 >= (rates.qualify_full_months_14 ?? 10);
    const fullBy22 = m22 != null && m22 >= (rates.qualify_full_months_22 ?? 15);
    const halfBy14 = m14 != null && m14 >= (rates.qualify_half_months ?? 6);

    let confidence: MoneyLine['confidence'] = 'calculated';
    if (m14 == null && m22 == null) {
      notes.push('לא הוזנו חודשי ביטוח — החישוב מניח זכאות מלאה. יש לאמת מול ביטוח לאומי.');
      confidence = 'estimated';
    } else if (!fullBy14 && !fullBy22 && halfBy14) {
      notes.push(
        `לפי חודשי הביטוח שהוזנו הזכאות היא חלקית בלבד — ${rates.qualify_half_weeks ?? 7} שבועות ולא ${weeks}.`,
      );
      confidence = 'estimated';
    } else if (!halfBy14 && !fullBy22) {
      notes.push('לפי חודשי הביטוח שהוזנו ייתכן שאין זכאות כלל. חובה לאמת מול הסניף.');
      confidence = 'estimated';
    }
    if (capped) notes.push('התעריף היומי הוגבל לתקרה החוקית.');
    if (person.role === 'partner') {
      notes.push('תנאי הסף נספרים ליום הפסקת העבודה שלך — לא ליום הלידה.');
    }

    lines.push({
      key: `maternity_${person.role}`,
      label: `דמי לידה — ${roleLabel} (${weeks} שבועות)`,
      amount: round(daily * days),
      confidence,
      formula: `${formula}, × ${days} ימי לוח (${weeks} שבועות × 7)`,
      notes,
    });
  }

  // ── ניכויים: לא מומצא כאן ───────────────────────────────
  lines.push({
    key: 'deductions',
    label: 'ניכויים מדמי הלידה',
    amount: null,
    confidence: 'unverifiable',
    formula: 'לא ניתן לחישוב מדויק מראש.',
    notes: [
      'מדמי הלידה מנוכים ביטוח לאומי, ביטוח בריאות ומס הכנסה.',
      'המס על דמי לידה מחושב **בנפרד** משאר ההכנסה השנתית ולא לפי המדרגה השולית הרגילה — ולכן לא ניתן לגזור אותו מהשכר.',
      'הסכומים למעלה הם ברוטו. שווה לבדוק החזר מס בסוף השנה.',
    ],
  });

  // ── 5 ימי ההיעדרות הראשונים ─────────────────────────────
  const partner = profile.persons.find((p) => p.role === 'partner');
  if (partner && (partner.employment === 'employee' || partner.employment === 'both')) {
    const perDay = rates.work_days_per_month
      ? partner.monthlyGross != null
        ? partner.monthlyGross / rates.work_days_per_month
        : null
      : null;

    if (perDay == null) {
      missing.push('שכר ברוטו חודשי — בן/בת זוג (ל-5 ימי ההיעדרות)');
      lines.push({
        key: 'paternity_days',
        label: '5 ימי היעדרות ראשונים',
        amount: null,
        confidence: 'needs_input',
        formula: `שווי יום = ברוטו חודשי ÷ ${rates.work_days_per_month ?? 21.66}`,
      });
    } else {
      // מינימום חוקי: יום 1 מחלה 0%, 3 ימי חופשה 100%, 2 ימי מחלה 50%
      const paidDays = partner.sickPaidFromDayOne ? 5 : 0 + 3 + 2 * 0.5;
      lines.push({
        key: 'paternity_days',
        label: '5 ימי היעדרות ראשונים',
        amount: round(perDay * paidDays),
        confidence: 'calculated',
        formula: partner.sickPaidFromDayOne
          ? `שווי יום ${ils(perDay)} × 5 ימים (חוזה שמשלם 100% מיום ראשון)`
          : `שווי יום ${ils(perDay)} × ${paidDays} (יום מחלה ראשון 0%, 3 ימי חופשה 100%, 2 ימי מחלה 50%)`,
        notes: partner.sickPaidFromDayOne
          ? ['3 מתוך הימים נלקחים ממכסת החופשה השנתית — זה לא כסף נוסף אלא ניצול צבירה.']
          : [
              '3 מתוך הימים נלקחים ממכסת החופשה השנתית.',
              '**בדוק/י את מדיניות המעסיק**: חוזה שמשלם 100% מיום מחלה ראשון מעלה את הסכום הזה משמעותית.',
            ],
      });
    }
  }

  // ── החזר מלונית ─────────────────────────────────────────
  if (profile.hotelNights && profile.hotelNights > 0) {
    const dailyCap = rates.hmo_hotel_daily_cap;
    const basket = profile.pregnancyBasketRemaining ?? rates.pregnancy_basket ?? null;
    if (dailyCap != null) {
      const byCap = dailyCap * profile.hotelNights;
      const amount = basket != null ? Math.min(byCap, basket) : byCap;
      const limitedByBasket = basket != null && byCap > basket;
      lines.push({
        key: 'hotel_refund',
        label: `החזר מלונית (${profile.hotelNights} לילות)`,
        amount: round(amount),
        confidence: 'estimated',
        formula: limitedByBasket
          ? `${ils(dailyCap)} ₪ × ${profile.hotelNights} לילות = ${ils(byCap)} ₪, מוגבל ליתרת הסל ${ils(basket!)} ₪`
          : `${ils(dailyCap)} ₪ ליום × ${profile.hotelNights} לילות`,
        notes: [
          `ההחזר הוא ${rates.hmo_hotel_pct ?? 75}% מההוצאה **או** התקרה היומית — הנמוך מביניהם. החישוב כאן מניח שהתקרה היא שקובעת.`,
          'בחלק מהקופות ההחזר נמשך מסל הריון ולידה ולא מתקציב נפרד — לבדוק יתרה לפני ההזמנה.',
        ],
      });
    }
  }

  const total = lines.reduce((sum, l) => sum + (l.amount ?? 0), 0);

  return {
    lines,
    total: round(total),
    missingInputs: [...new Set(missing)],
    disclaimer:
      'הערכה בלבד, לא ייעוץ משפטי או פיננסי. הסכומים ברוטו ולפני ניכויים, ומבוססים על הנתונים שהוזנו ועל שיעורים שמתעדכנים מעת לעת. הקובע הוא ביטוח לאומי.',
  };
}
