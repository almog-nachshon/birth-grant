import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notConfigured } from '@/lib/supabase/guard';

const STATUSES = ['todo', 'in_progress', 'done', 'not_relevant'] as const;
const MAX_NOTE = 4000;

export async function PATCH(request: NextRequest) {
  const blocked = notConfigured();
  if (blocked) return blocked;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'לא מחובר' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: 'חסר מזהה משימה' }, { status: 400 });

  const update: Record<string, unknown> = {};

  if ('status' in body) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'סטטוס לא חוקי' }, { status: 400 });
    }
    update.status = body.status;
  }
  if ('note' in body) {
    if (typeof body.note !== 'string' || body.note.length > MAX_NOTE) {
      return NextResponse.json({ error: 'הערה לא תקינה' }, { status: 400 });
    }
    update.note = body.note;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'אין מה לעדכן' }, { status: 400 });
  }

  // ה-RLS הוא שמוודא שהמשימה שייכת לתיק של המשתמש
  const { data, error } = await supabase
    .from('case_tasks')
    .update(update)
    .eq('id', body.id)
    .select('id, status, note, case_id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 403 });

  if ('status' in update) {
    await supabase.from('case_events').insert({
      case_id: data.case_id,
      actor_id: user.id,
      action: update.status === 'done' ? 'task.completed' : 'task.reopened',
      payload: { task_id: data.id },
    });
  }

  return NextResponse.json({ task: data });
}
