import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notConfigured } from '@/lib/supabase/guard';

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'];
const MAX_BYTES = 15 * 1024 * 1024;

/** רישום מסמך שכבר הועלה ל-Storage ישירות מהדפדפן. */
export async function POST(request: NextRequest) {
  const blocked = notConfigured();
  if (blocked) return blocked;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'לא מחובר' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.caseId || !body?.storagePath || !body?.filename) {
    return NextResponse.json({ error: 'חסרים שדות' }, { status: 400 });
  }

  // הנתיב חייב להיות בתוך התיק שנטען. מונע רישום קובץ של תיק אחר.
  if (!String(body.storagePath).startsWith(`case/${body.caseId}/`)) {
    return NextResponse.json({ error: 'נתיב אחסון לא תואם לתיק' }, { status: 400 });
  }
  if (!ALLOWED_MIME.includes(body.mime)) {
    return NextResponse.json({ error: 'סוג קובץ לא נתמך' }, { status: 400 });
  }
  if (typeof body.size !== 'number' || body.size <= 0 || body.size > MAX_BYTES) {
    return NextResponse.json({ error: 'גודל קובץ לא תקין' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('case_documents')
    .insert({
      case_id: body.caseId,
      case_task_id: body.taskId ?? null,
      storage_path: body.storagePath,
      filename: String(body.filename).slice(0, 200),
      mime: body.mime,
      size_bytes: body.size,
      uploaded_by: user.id,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 403 });

  await supabase.from('case_events').insert({
    case_id: body.caseId,
    actor_id: user.id,
    action: 'doc.uploaded',
    payload: { document_id: data.id, filename: data.filename },
  });

  return NextResponse.json({ document: data });
}

/** מחיקת מסמך. הטריגר בבסיס הנתונים מוחק גם את הקובץ עצמו. */
export async function DELETE(request: NextRequest) {
  const blocked = notConfigured();
  if (blocked) return blocked;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'לא מחובר' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 });

  const { error } = await supabase.from('case_documents').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });

  return NextResponse.json({ ok: true });
}
