import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import Wizard from './Wizard';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'שאלון פתיחת תיק — מענקי לידה' };

/**
 * השאלון המודרך. נפרד מהאזור האישי בכוונה:
 * שם הכול פתוח בבת אחת לעריכה, וכאן מובילים שלב-שלב את מי שעוד לא
 * יודע מאיפה להתחיל. שניהם כותבים לאותו API ולאותן שורות.
 */
export default async function OnboardingPage() {
  if (!isSupabaseConfigured()) redirect('/login?next=/onboarding');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/onboarding');

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('display_name, phone')
    .eq('id', user.id)
    .maybeSingle();

  // אם כבר יש תיק, מתחילים מהערכים הקיימים ולא מטופס ריק
  const { data: membership } = await supabase
    .from('case_members')
    .select('case_id')
    .limit(1)
    .maybeSingle();

  let caseDefaults = {};
  if (membership) {
    const { data: caseRow } = await supabase
      .from('cases')
      .select('due_date, birth_order, multiple_birth, hmo')
      .eq('id', membership.case_id)
      .maybeSingle();

    if (caseRow) {
      caseDefaults = {
        dueDate: caseRow.due_date ?? '',
        birthOrder: caseRow.birth_order ?? 1,
        multipleBirth: caseRow.multiple_birth ?? false,
        hmo: caseRow.hmo ?? '',
      };
    }
  }

  return (
    <Wizard
      initial={{
        fullName: profileRow?.display_name ?? '',
        phone: profileRow?.phone ?? '',
        ...caseDefaults,
      }}
    />
  );
}
