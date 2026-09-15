import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notConfigured } from '@/lib/supabase/guard';
import { calculateEntitlements } from '@/lib/engine/entitlements';
import { buildSchedule } from '@/lib/engine/schedule';
import { ratesAt } from '@/lib/rates';
import { streamAssistantReply, type AssistantContext } from '@/lib/ai/assistant';
import type { CaseProfile, EmploymentType, TaskLink } from '@/lib/engine/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_MESSAGE = 4000;
const MAX_HISTORY = 20;

/** נושאים שהמחקר סימן כלא-מאומתים. המודל חייב להצהיר עליהם. */
const UNRESOLVED = [
  'שילוב דמי לידה עם קצבת נכות כללית — אין מקור רשמי, חובה לברר מול הסניף',
  'נוסח האישור על חזרת בן/בת זוג עצמאי/ת לעיסוק — אין נוסח רשמי',
  'סכום תוספת הילד באגף השיקום — טעון אימות',
];

export async function POST(request: NextRequest) {
  const blocked = notConfigured();
  if (blocked) return blocked;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'לא מחובר' }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'העוזר אינו מוגדר בשרת' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const history = Array.isArray(body?.messages) ? body.messages : null;
  if (!history?.length) {
    return NextResponse.json({ error: 'אין הודעות' }, { status: 400 });
  }
  if (history.length > MAX_HISTORY) {
    return NextResponse.json({ error: 'השיחה ארוכה מדי' }, { status: 400 });
  }
  for (const m of history) {
    if (!['user', 'assistant'].includes(m.role) || typeof m.content !== 'string') {
      return NextResponse.json({ error: 'הודעה לא תקינה' }, { status: 400 });
    }
    if (m.content.length > MAX_MESSAGE) {
      return NextResponse.json({ error: 'הודעה ארוכה מדי' }, { status: 400 });
    }
  }

  // ── בניית ההקשר מהתיק. RLS מוודא שזה התיק של המשתמש. ──
  const { data: membership } = await supabase
    .from('case_members').select('case_id').limit(1).maybeSingle();
  if (!membership) return NextResponse.json({ error: 'אין תיק' }, { status: 404 });

  const caseId = membership.case_id as string;
  const [{ data: caseRow }, { data: persons }, { data: tasks }] = await Promise.all([
    supabase.from('cases').select('*').eq('id', caseId).single(),
    supabase.from('case_persons').select('*').eq('case_id', caseId),
    supabase
      .from('case_tasks')
      .select('title, due_at, status, links')
      .eq('case_id', caseId)
      .order('due_at'),
  ]);
  if (!caseRow) return NextResponse.json({ error: 'אין תיק' }, { status: 404 });

  const rates = ratesAt();
  const profile: CaseProfile = {
    dueDate: caseRow.due_date,
    actualBirthDate: caseRow.actual_birth_date ?? undefined,
    birthOrder: 1,
    multipleBirth: false,
    persons: (persons ?? []).map((p) => ({
      role: p.role as 'birthing_parent' | 'partner',
      employment: p.employment as EmploymentType,
      takesLeave: p.takes_leave,
      hasEmployerPolicy: p.has_employer_policy,
      hasDisabilityBL: p.extra?.hasDisabilityBL,
      hasDisabilityMOD: p.extra?.hasDisabilityMOD,
    })),
  };

  const context: AssistantContext = {
    entitlements: calculateEntitlements(profile, rates),
    schedule: buildSchedule(profile, rates),
    openTasks: (tasks ?? [])
      .filter((t) => t.status !== 'done')
      .slice(0, 25)
      .map((t) => ({
        title: t.title,
        dueAt: t.due_at,
        critical: false,
        links: (t.links ?? []) as TaskLink[],
      })),
    unresolvedTopics: UNRESOLVED,
  };

  // ── הזרמה ללקוח ──
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const reply = streamAssistantReply(context, history);
        for await (const event of reply) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'שגיאה';
        controller.enqueue(encoder.encode(`\n\n[שגיאה: ${msg}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
