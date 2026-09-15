import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { calculateEntitlements } from '@/lib/engine/entitlements';
import { ratesAt } from '@/lib/rates';
import { toCaseProfile, type CaseRow, type PersonRow } from '@/lib/case/profile';
import AccountTabs from './AccountTabs';

export const dynamic = 'force-dynamic';

const CASE_COLS =
  'id, title, due_date, actual_birth_date, birth_order, multiple_birth, hmo, hotel_nights, pregnancy_basket_remaining';
const PERSON_COLS =
  'id, role, user_id, display_name, employment, employer_name, phone, email, has_employer_policy, takes_leave, leave_weeks, monthly_gross, annual_self_employed_income, insured_months_of_14, insured_months_of_22, insured_months_of_24, work_stop_date, sick_paid_from_day_one, disability_percent_bl, disability_percent_mod, disability_items, self_employed_status, input_sources, extra';

/** שורת הורה ריקה, לפני השמירה הראשונה. מאפשרת לרנדר את הטפסים בלי תיק. */
function blankPerson(role: 'birthing_parent' | 'partner'): PersonRow {
  return {
    id: `new-${role}`,
    role,
    user_id: null,
    display_name: null,
    phone: null,
    email: null,
    employment: 'employee',
    employer_name: null,
    has_employer_policy: false,
    takes_leave: role === 'partner',
    leave_weeks: null,
    monthly_gross: null,
    annual_self_employed_income: null,
    insured_months_of_14: null,
    insured_months_of_22: null,
    insured_months_of_24: null,
    work_stop_date: null,
    sick_paid_from_day_one: false,
    disability_percent_bl: null,
    disability_percent_mod: null,
    disability_items: [],
    self_employed_status: null,
    input_sources: {},
    extra: {},
  };
}

const BLANK_CASE: CaseRow = {
  id: 'new',
  title: 'התיק שלנו',
  due_date: null,
  actual_birth_date: null,
  birth_order: 1,
  multiple_birth: false,
  hmo: null,
  hotel_nights: null,
  pregnancy_basket_remaining: null,
};

export default async function AccountPage() {
  if (!isSupabaseConfigured()) redirect('/login?next=/account');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/account');

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('display_name, avatar_url, phone')
    .eq('id', user.id)
    .maybeSingle();

  const { data: membership } = await supabase
    .from('case_members')
    .select('case_id')
    .limit(1)
    .maybeSingle();

  let caseRow = BLANK_CASE;
  let persons = [blankPerson('birthing_parent'), blankPerson('partner')];
  let docs: Array<{ id: string; kind: string; filename: string }> = [];
  let taskStats = { total: 0, done: 0, nextDue: null as string | null };

  if (membership) {
    const [{ data: c }, { data: p }, { data: d }, { data: t }] = await Promise.all([
      supabase.from('cases').select(CASE_COLS).eq('id', membership.case_id).single(),
      supabase.from('case_persons').select(PERSON_COLS).eq('case_id', membership.case_id).order('role'),
      supabase
        .from('case_documents')
        .select('id, kind, filename')
        .eq('case_id', membership.case_id)
        .order('created_at'),
      supabase.from('case_tasks').select('status, due_at').eq('case_id', membership.case_id),
    ]);

    if (c) caseRow = c as unknown as CaseRow;
    if (p?.length) {
      const rows = p as unknown as PersonRow[];
      persons = (['birthing_parent', 'partner'] as const).map(
        (role) => rows.find((r) => r.role === role) ?? blankPerson(role),
      );
    }
    docs = (d ?? []) as Array<{ id: string; kind: string; filename: string }>;

    const tasks = t ?? [];
    const open = tasks
      .filter((row) => row.status !== 'done' && row.due_at)
      .map((row) => row.due_at as string)
      .sort();
    taskStats = {
      total: tasks.length,
      done: tasks.filter((row) => row.status === 'done').length,
      nextDue: open[0] ?? null,
    };
  }

  const birthing = persons.find((p) => p.role === 'birthing_parent')!;
  const partner = persons.find((p) => p.role === 'partner')!;

  // החישוב רץ רק כשיש תאריך לידה. בלעדיו אין עוגן לשום תאריך במערכת.
  const profile = toCaseProfile(caseRow, persons);
  const entitlements = profile ? calculateEntitlements(profile, ratesAt()) : null;

  // מי מההורים מקושר למשתמש המחובר. null = טרם הצהיר.
  const myRole = persons.find((p) => p.user_id === user.id)?.role ?? null;

  return (
    <AccountTabs
      userName={profileRow?.display_name ?? user.email?.split('@')[0] ?? ''}
      avatarUrl={profileRow?.avatar_url ?? null}
      me={{
        fullName: profileRow?.display_name ?? null,
        phone: profileRow?.phone ?? null,
        email: user.email ?? '',
      }}
      myRole={myRole}
      caseRow={caseRow}
      birthing={birthing}
      partner={partner}
      docs={docs}
      entitlements={entitlements}
      taskStats={taskStats}
    />
  );
}
