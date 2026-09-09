import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notConfigured } from '@/lib/supabase/guard';
import { resolveTasks, type CatalogTask } from '@/lib/engine/resolve-tasks';
import { ratesAt, interpolate } from '@/lib/rates';
import catalog from '@/content/catalog.json';
import type { CaseProfile, EmploymentType } from '@/lib/engine/types';

interface Body {
  dueDate: string;
  birthOrder: 1 | 2 | 3;
  multipleBirth: boolean;
  hmo?: string;
  birthing: PersonInput;
  partner: PersonInput;
}
interface PersonInput {
  displayName?: string;
  employment: EmploymentType;
  employerName?: string;
  hasEmployerPolicy?: boolean;
  takesLeave?: boolean;
  leaveWeeks?: number;
  hasDisabilityBL?: boolean;
  hasDisabilityMOD?: boolean;
  hasDisabilityWorkInjury?: boolean;
}

export async function POST(request: NextRequest) {
  const blocked = notConfigured();
  if (blocked) return blocked;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'לא מחובר' }, { status: 401 });

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 });
  }

  if (!body.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)) {
    return NextResponse.json({ error: 'תאריך לידה משוער חסר או לא תקין' }, { status: 400 });
  }

  // ── התיק ──
  const { data: newCase, error: caseErr } = await supabase
    .from('cases')
    .insert({ due_date: body.dueDate, created_by: user.id })
    .select('id')
    .single();

  if (caseErr || !newCase) {
    return NextResponse.json({ error: caseErr?.message ?? 'יצירת התיק נכשלה' }, { status: 500 });
  }
  const caseId = newCase.id as string;

  // ── שני ההורים ──
  const persons = [
    { role: 'birthing_parent' as const, input: body.birthing, user_id: user.id },
    { role: 'partner' as const, input: body.partner, user_id: null },
  ];

  const { error: personsErr } = await supabase.from('case_persons').insert(
    persons.map(({ role, input, user_id }) => ({
      case_id: caseId,
      role,
      user_id,
      display_name: input.displayName ?? null,
      employment: input.employment,
      employer_name: input.employerName ?? null,
      hmo: body.hmo ?? null,
      has_employer_policy: input.hasEmployerPolicy ?? false,
      takes_leave: input.takesLeave ?? false,
      extra: {
        hasDisabilityBL: input.hasDisabilityBL ?? false,
        hasDisabilityMOD: input.hasDisabilityMOD ?? false,
        hasDisabilityWorkInjury: input.hasDisabilityWorkInjury ?? false,
      },
    })),
  );
  if (personsErr) {
    return NextResponse.json({ error: personsErr.message }, { status: 500 });
  }

  // ── גזירת המשימות מהקטלוג ──
  const rates = ratesAt();
  const profile: CaseProfile = {
    dueDate: body.dueDate,
    birthOrder: body.birthOrder ?? 1,
    multipleBirth: body.multipleBirth ?? false,
    hmo: body.hmo,
    persons: persons.map(({ role, input }) => ({
      role,
      employment: input.employment,
      takesLeave: input.takesLeave ?? false,
      leaveWeeks: input.leaveWeeks,
      hasEmployerPolicy: input.hasEmployerPolicy,
      hasDisabilityBL: input.hasDisabilityBL,
      hasDisabilityMOD: input.hasDisabilityMOD,
      hasDisabilityWorkInjury: input.hasDisabilityWorkInjury,
    })),
  };

  const resolved = resolveTasks(catalog.tasks as CatalogTask[], profile, rates);

  // שם להצגה לכל הורה, לשיוך משימות שמופיעות לשניהם
  const labelFor = (role: 'birthing_parent' | 'partner') => {
    const input = role === 'birthing_parent' ? body.birthing : body.partner;
    return input.displayName?.trim() || (role === 'birthing_parent' ? 'היולדת' : 'בן/בת הזוג');
  };

  // מפתח ייחודי לכל שורה: משימת "any" עשויה להופיע פעם לכל הורה.
  // בלי שיוך בכותרת שתי השורות נראות זהות במסך.
  const rows = resolved.map((t, i) => ({
    case_id: caseId,
    catalog_key: t.assignedRole && t.role === 'any' ? `${t.key}:${t.assignedRole}` : t.key,
    title:
      t.role === 'any' && t.assignedRole
        ? `${t.title} — ${labelFor(t.assignedRole)}`
        : t.title,
    body: t.body ? interpolate(t.body, rates) : null,
    requires_doc: t.requires_doc ?? false,
    due_at: t.dueAt,
    due_kind: t.date_rule?.kind ?? null,
    sort: i,
  }));

  const { error: tasksErr } = await supabase.from('case_tasks').insert(rows);
  if (tasksErr) {
    return NextResponse.json({ error: tasksErr.message }, { status: 500 });
  }

  return NextResponse.json({ caseId, taskCount: rows.length });
}
