import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notConfigured } from '@/lib/supabase/guard';
import { syncCaseTasks } from '@/lib/case/materialize';
import { toCaseProfile, type CaseRow, type PersonRow } from '@/lib/case/profile';
import type { EmploymentType, ParentRole } from '@/lib/engine/types';

const EMPLOYMENT: EmploymentType[] = ['employee', 'self_employed', 'both', 'unemployed'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HMOS = ['כללית', 'מכבי', 'מאוחדת', 'לאומית'];

const CASE_COLS =
  'id, title, due_date, actual_birth_date, birth_order, multiple_birth, hmo, hotel_nights, pregnancy_basket_remaining';
const PERSON_COLS =
  'id, role, user_id, display_name, employment, employer_name, phone, email, has_employer_policy, takes_leave, leave_weeks, monthly_gross, annual_self_employed_income, insured_months_of_14, insured_months_of_22, insured_months_of_24, work_stop_date, sick_paid_from_day_one, disability_percent_bl, disability_percent_mod, disability_items, self_employed_status, input_sources, extra';

/**
 * ערך מספרי בתוך טווח, או null.
 * מחוץ לטווח נזרק ולא נשמר — null במנוע אומר "לא ידוע", וזה מצב אחר
 * לגמרי מ"הוקלד ערך שגוי". עדיף להשאיר חסר מאשר לשמור זבל.
 */
function num(value: unknown, min: number, max: number): number | null | undefined {
  if (value === null || value === '') return null;
  if (value === undefined) return undefined;
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

function date(value: unknown): string | null | undefined {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  return ISO_DATE.test(value) ? value : undefined;
}

function text(value: unknown, max: number, allowed?: string[]): string | null | undefined {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const t = value.trim().slice(0, max);
  if (allowed && !allowed.includes(t)) return undefined;
  return t || null;
}

const bool = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

/** טלפון ישראלי בכל צורה שנוחה למשתמש. נשמר עם ספרות וסימנים בלבד. */
function phone(value: unknown): string | null | undefined {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim().replace(/[^\d+\-() ]/g, '');
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 15) return undefined;
  return cleaned.slice(0, 20);
}

/** מסנן את המפתחות שערכם undefined, כדי ש-PATCH חלקי לא ידרוס שדות. */
function defined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * שדות שהלקוח שלח אך הוולידציה דחתה.
 * בלי זה הבקשה מחזירה 200 והמסך מציג "נשמר" על ערך שלא נכתב —
 * והמשתמש מגלה את זה רק בטעינה הבאה, בטופס שמדובר בו בשכר.
 */
function rejected(
  input: Record<string, unknown>,
  patch: Record<string, unknown>,
  labels: Record<string, string>,
): string[] {
  return Object.entries(labels)
    .filter(([field, column]) => input[field] !== undefined && !(column in patch))
    .map(([, column]) => COLUMN_LABELS[column] ?? column);
}

const CASE_FIELDS: Record<string, string> = {
  dueDate: 'due_date',
  actualBirthDate: 'actual_birth_date',
  birthOrder: 'birth_order',
  multipleBirth: 'multiple_birth',
  hmo: 'hmo',
  hotelNights: 'hotel_nights',
};

const PERSON_FIELDS: Record<string, string> = {
  displayName: 'display_name',
  employment: 'employment',
  employerName: 'employer_name',
  leaveWeeks: 'leave_weeks',
  monthlyGross: 'monthly_gross',
  annualSelfEmployedIncome: 'annual_self_employed_income',
  insuredMonthsOf14: 'insured_months_of_14',
  insuredMonthsOf22: 'insured_months_of_22',
  insuredMonthsOf24: 'insured_months_of_24',
  selfEmployedStatus: 'self_employed_status',
  disabilityPercentBL: 'disability_percent_bl',
  disabilityPercentMOD: 'disability_percent_mod',
  phone: 'phone',
  email: 'email',
  workStopDate: 'work_stop_date',
};

const COLUMN_LABELS: Record<string, string> = {
  due_date: 'תאריך לידה משוער',
  actual_birth_date: 'תאריך לידה בפועל',
  birth_order: 'איזה ילד',
  hmo: 'קופת חולים',
  hotel_nights: 'לילות מלונית',
  display_name: 'שם',
  employment: 'סוג העסקה',
  employer_name: 'שם המעסיק',
  leave_weeks: 'חלוקת שבועות',
  monthly_gross: 'שכר ברוטו חודשי',
  annual_self_employed_income: 'הכנסה שנתית לפי שומה',
  insured_months_of_14: 'חודשי ביטוח מתוך 14',
  insured_months_of_22: 'חודשי ביטוח מתוך 22',
  insured_months_of_24: 'חודשי ביטוח בשנתיים האחרונות',
  self_employed_status: 'סוג העוסק',
  disability_percent_bl: 'אחוזי נכות — ביטוח לאומי',
  disability_percent_mod: 'אחוזי נכות — אגף השיקום',
  phone: 'טלפון',
  email: 'מייל',
  work_stop_date: 'יום הפסקת העבודה',
};

function casePatch(input: Record<string, unknown>) {
  return defined({
    due_date: date(input.dueDate),
    actual_birth_date: date(input.actualBirthDate),
    // NOT NULL בסכמה — null מהלקוח מושמט ולא נשלח כניסיון דריסה
    birth_order: num(input.birthOrder, 1, 3) ?? undefined,
    multiple_birth: bool(input.multipleBirth),
    hmo: text(input.hmo, 40, HMOS),
    hotel_nights: num(input.hotelNights, 0, 60),
    pregnancy_basket_remaining: num(input.pregnancyBasketRemaining, 0, 100_000),
  });
}

function personPatch(input: Record<string, unknown>) {
  const employment =
    typeof input.employment === 'string' && EMPLOYMENT.includes(input.employment as EmploymentType)
      ? (input.employment as EmploymentType)
      : undefined;

  return defined({
    display_name: text(input.displayName, 80),
    employment,
    employer_name: text(input.employerName, 120),
    has_employer_policy: bool(input.hasEmployerPolicy),
    takes_leave: bool(input.takesLeave),
    leave_weeks: num(input.leaveWeeks, 0, 15),
    monthly_gross: num(input.monthlyGross, 0, 1_000_000),
    annual_self_employed_income: num(input.annualSelfEmployedIncome, 0, 20_000_000),
    insured_months_of_14: num(input.insuredMonthsOf14, 0, 14),
    insured_months_of_22: num(input.insuredMonthsOf22, 0, 22),
    insured_months_of_24: num(input.insuredMonthsOf24, 0, 24),
    phone: phone(input.phone),
    email: text(input.email, 200),
    work_stop_date: date(input.workStopDate),
    sick_paid_from_day_one: bool(input.sickPaidFromDayOne),
    disability_percent_bl: num(input.disabilityPercentBL, 0, 100),
    disability_percent_mod: num(input.disabilityPercentMOD, 0, 100),
    disability_items: items(input.disabilityItems),
    self_employed_status: text(input.selfEmployedStatus, 20, ['exempt', 'licensed', 'company']),
  });
}

/**
 * פירוט הליקויים מהפרוטוקול.
 * האחוז המשוקלל אינו סכום הליקויים — הוועדה מחשבת אותו אחרת — ולכן
 * הפירוט נשמר כרשימה להצגה בלבד, ולא נגזר ממנו שום מספר.
 */
function items(value: unknown): Array<{ condition: string; percent: number | null }> | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  return value
    .slice(0, 20)
    .map((row) => {
      const r = (row ?? {}) as Record<string, unknown>;
      const condition = typeof r.condition === 'string' ? r.condition.trim().slice(0, 120) : '';
      const raw = typeof r.percent === 'number' ? r.percent : Number(r.percent);
      const percent = Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : null;
      return { condition, percent };
    })
    .filter((row) => row.condition.length > 0);
}

/** דגלי הנכות יושבים ב-jsonb, ולכן מתמזגים ולא נדרסים. */
function extraPatch(input: Record<string, unknown>, current: Record<string, boolean> | null) {
  const next = { ...(current ?? {}) };
  let touched = false;
  for (const key of ['hasDisabilityBL', 'hasDisabilityMOD', 'hasDisabilityWorkInjury'] as const) {
    const v = bool(input[key]);
    if (v !== undefined) {
      next[key] = v;
      touched = true;
    }
  }
  return touched ? next : undefined;
}

async function loadCase(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: membership } = await supabase
    .from('case_members')
    .select('case_id')
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  const [{ data: caseRow }, { data: persons }] = await Promise.all([
    supabase.from('cases').select(CASE_COLS).eq('id', membership.case_id).single(),
    supabase.from('case_persons').select(PERSON_COLS).eq('case_id', membership.case_id).order('role'),
  ]);

  if (!caseRow) return null;
  return { caseRow: caseRow as unknown as CaseRow, persons: (persons ?? []) as unknown as PersonRow[] };
}

export async function GET() {
  const blocked = notConfigured();
  if (blocked) return blocked;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'לא מחובר' }, { status: 401 });

  const loaded = await loadCase(supabase);
  if (!loaded) return NextResponse.json({ case: null, persons: [] });
  return NextResponse.json({ case: loaded.caseRow, persons: loaded.persons });
}

export async function PATCH(request: NextRequest) {
  const blocked = notConfigured();
  if (blocked) return blocked;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'לא מחובר' }, { status: 401 });

  let body: {
    case?: Record<string, unknown>;
    birthing?: Record<string, unknown>;
    partner?: Record<string, unknown>;
    me?: Record<string, unknown>;
    myRole?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 });
  }

  let loaded = await loadCase(supabase);

  // אין תיק — נוצר ריק בשמירה הראשונה, כדי שהאזור האישי יהיה מיד בר-עריכה.
  //
  // בלי .select(): ב-INSERT ... RETURNING מחיל Postgres גם את מדיניות
  // ה-SELECT, ששואלת אם המשתמש חבר בתיק. שורת החברוּת נוצרת בטריגר
  // AFTER INSERT שטרם רץ, ולכן ה-RETURNING נדחה והיצירה נכשלה תמיד.
  // טוענים מחדש בפקודה נפרדת, אחרי שהטריגר סיים.
  if (!loaded) {
    const { error } = await supabase.from('cases').insert({ created_by: user.id });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    loaded = await loadCase(supabase);
    if (!loaded) {
      return NextResponse.json(
        { error: 'התיק נוצר אך לא נטען חזרה. נסו לרענן את הדף.' },
        { status: 500 },
      );
    }

    const { error: pErr } = await supabase.from('case_persons').insert([
      { case_id: loaded.caseRow.id, role: 'birthing_parent', user_id: user.id, employment: 'employee' },
      { case_id: loaded.caseRow.id, role: 'partner', employment: 'employee' },
    ]);
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    loaded = await loadCase(supabase);
    if (!loaded) return NextResponse.json({ error: 'יצירת התיק נכשלה' }, { status: 500 });
  }

  const { caseRow, persons } = loaded;
  const bad: string[] = [];

  // ── הפרופיל של המשתמש עצמו ──
  if (body.me) {
    const mePatch = defined({
      display_name: text(body.me.fullName, 80),
      phone: phone(body.me.phone),
    });
    bad.push(...rejected(body.me, mePatch, { fullName: 'display_name', phone: 'phone' }));
    if (Object.keys(mePatch).length) {
      const { error } = await supabase.from('profiles').update(mePatch).eq('id', user.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // ── מי אני בתיק ──
  // RPC ולא שני UPDATE מכאן: שחרור התפקיד הישן ותפיסת החדש חייבים
  // לקרות יחד, אחרת רגע אחד שני ההורים מקושרים לאותו משתמש.
  if (body.myRole === 'birthing_parent' || body.myRole === 'partner') {
    const current = persons.find((p) => p.user_id === user.id);
    if (current?.role !== body.myRole) {
      const { error } = await supabase.rpc('claim_person_role', { target_role: body.myRole });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // ── התיק ──
  if (body.case) {
    const patch = casePatch(body.case);
    bad.push(...rejected(body.case, patch, CASE_FIELDS));
    if (Object.keys(patch).length) {
      const { error } = await supabase.from('cases').update(patch).eq('id', caseRow.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // ── ההורים ──
  for (const [key, role] of [
    ['birthing', 'birthing_parent'],
    ['partner', 'partner'],
  ] as [keyof typeof body, ParentRole][]) {
    const input = body[key] as Record<string, unknown> | undefined;
    if (!input) continue;
    const row = persons.find((p) => p.role === role);
    if (!row) continue;

    const patch: Record<string, unknown> = personPatch(input);
    bad.push(...rejected(input, patch, PERSON_FIELDS));
    const extra = extraPatch(input, row.extra);
    if (extra) patch.extra = extra;

    // מקור כל שדה כספי, כדי שהמסך יוכל לומר "נקרא מהתלוש" מול "הוקלד"
    const sources = { ...(row.input_sources ?? {}) };
    const declared = typeof input.source === 'string' ? input.source : 'manual';
    let sourcesTouched = false;
    for (const field of [
      'monthlyGross',
      'annualSelfEmployedIncome',
      'insuredMonthsOf14',
      'insuredMonthsOf22',
      'workStopDate',
    ] as const) {
      if (input[field] !== undefined) {
        sources[field] = declared === 'document' ? 'document' : 'manual';
        sourcesTouched = true;
      }
    }
    if (sourcesTouched) patch.input_sources = sources;

    if (Object.keys(patch).length) {
      const { error } = await supabase.from('case_persons').update(patch).eq('id', row.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // ── סנכרון המשימות מול הפרופיל המעודכן ──
  const fresh = await loadCase(supabase);
  if (!fresh) return NextResponse.json({ error: 'טעינה מחדש נכשלה' }, { status: 500 });

  const profile = toCaseProfile(fresh.caseRow, fresh.persons);
  let sync = null;
  if (profile) {
    try {
      sync = await syncCaseTasks(
        supabase,
        fresh.caseRow.id,
        profile,
        Object.fromEntries(fresh.persons.map((p) => [p.role, p.display_name])),
      );
    } catch (err) {
      // הפרופיל נשמר; רק בניית המשימות נכשלה. לא מאבדים את הקלט של המשתמש.
      return NextResponse.json(
        {
          case: fresh.caseRow,
          persons: fresh.persons,
          sync: null,
          warning: err instanceof Error ? err.message : 'בניית המשימות נכשלה',
        },
        { status: 207 },
      );
    }
  }

  const { data: meRow } = await supabase
    .from('profiles')
    .select('display_name, phone, avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  return NextResponse.json({
    case: fresh.caseRow,
    persons: fresh.persons,
    me: meRow ?? null,
    myRole: fresh.persons.find((p) => p.user_id === user.id)?.role ?? null,
    sync,
    ...(bad.length
      ? { warning: `לא נשמרו (ערך לא תקין): ${[...new Set(bad)].join(', ')}` }
      : {}),
  });
}
