'use client';

import { useRef, useState } from 'react';
import s from './case.module.css';

interface TaskLink {
  label: string;
  url: string;
  kind: 'online' | 'form' | 'info';
}

interface Task {
  id: string;
  title: string;
  body: string | null;
  requires_doc: boolean;
  doc_hint: string | null;
  links: TaskLink[] | null;
  status: 'todo' | 'in_progress' | 'done' | 'not_relevant';
  due_at: string | null;
  due_kind: string | null;
  note: string | null;
}

interface Doc {
  id: string;
  case_task_id: string | null;
  filename: string;
  storage_path: string;
  size_bytes: number;
}

/** תווית קצרה לפי סוג הקישור, כדי שיהיה ברור מראש מה נפתח בלחיצה. */
const LINK_KIND: Record<TaskLink['kind'], string> = {
  online: 'מקוון',
  form: 'PDF',
  info: 'מידע',
};

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'];

export default function TaskList({
  caseId,
  initialTasks,
  initialDocs,
}: {
  caseId: string;
  initialTasks: Task[];
  initialDocs: Doc[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [docs, setDocs] = useState(initialDocs);
  const [filter, setFilter] = useState<'all' | 'open' | 'docs'>('open');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const noteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  async function patch(id: string, payload: Record<string, unknown>) {
    const res = await fetch('/api/case/task', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...payload }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'העדכון נכשל');
    }
  }

  function toggle(task: Task) {
    const next = task.status === 'done' ? 'todo' : 'done';
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
    void patch(task.id, { status: next });
  }

  function setNote(id: string, value: string) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, note: value } : t)));
    clearTimeout(noteTimers.current[id]);
    noteTimers.current[id] = setTimeout(() => void patch(id, { note: value }), 600);
  }

  async function upload(taskId: string, file: File) {
    setError('');
    if (file.size > MAX_BYTES) {
      setError(`הקובץ גדול מדי (${(file.size / 1048576).toFixed(1)}MB). המגבלה 15MB.`);
      return;
    }
    if (!ALLOWED.includes(file.type)) {
      setError('סוג קובץ לא נתמך. אפשר PDF או תמונה.');
      return;
    }

    setBusy(taskId);
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      // שם קובץ מנוקה — לא סומכים על מה שהמערכת של המשתמש נותנת
      const safeName = file.name.replace(/[^\w.\-֐-׿ ]/g, '_').slice(-80);
      const path = `case/${caseId}/${crypto.randomUUID()}-${safeName}`;

      // העלאה ישירה ל-Storage: הקובץ לא עובר דרך השרת שלנו
      const { error: upErr } = await supabase.storage
        .from('case-docs')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId,
          taskId,
          storagePath: path,
          filename: safeName,
          mime: file.type,
          size: file.size,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'רישום המסמך נכשל');

      setDocs((prev) => [...prev, json.document]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ההעלאה נכשלה');
    } finally {
      setBusy(null);
    }
  }

  async function download(doc: Doc) {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    // קישור קצר-תוקף. אין URL ציבורי לשום מסמך.
    const { data, error: err } = await supabase.storage
      .from('case-docs')
      .createSignedUrl(doc.storage_path, 60);
    if (err || !data) {
      setError('יצירת קישור ההורדה נכשלה');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  const visible = tasks.filter((t) => {
    if (filter === 'open') return t.status !== 'done';
    if (filter === 'docs') return t.requires_doc;
    return true;
  });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className={s.tasksCol}>
      <div className={s.filters}>
        {([['open', 'פתוחות'], ['docs', 'דורשות מסמך'], ['all', 'הכול']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={s.filterBtn}
            data-active={filter === k}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className={s.error} role="alert">{error}</p>}

      {visible.length === 0 && (
        <p className={s.empty}>
          {filter === 'open' ? 'הכול סומן כבוצע. יפה מאוד.' : 'אין משימות בקטגוריה הזו.'}
        </p>
      )}

      <div className={s.tasks}>
        {visible.map((task) => {
          const taskDocs = docs.filter((d) => d.case_task_id === task.id);
          const overdue = task.due_at && task.due_at < today && task.status !== 'done';

          return (
            <article key={task.id} className={s.task} data-done={task.status === 'done'}>
              <div className={s.taskMain}>
                <input
                  type="checkbox"
                  checked={task.status === 'done'}
                  onChange={() => toggle(task)}
                  className={s.checkbox}
                  id={`t-${task.id}`}
                />
                <div className={s.taskContent}>
                  <label htmlFor={`t-${task.id}`} className={s.taskTitle}>
                    {task.title}
                  </label>

                  <div className={s.taskMeta}>
                    {task.due_at && (
                      <span className={s.due} data-overdue={overdue}>
                        {task.due_kind === 'deadline' ? 'מועד אחרון' : 'עד'}{' '}
                        {new Date(task.due_at).toLocaleDateString('he-IL')}
                      </span>
                    )}
                    {task.requires_doc && <span className={s.docTag}>מסמך נדרש</span>}
                  </div>

                  {task.body && <p className={s.taskBody}>{stripMarkdown(task.body)}</p>}

                  {task.requires_doc && task.doc_hint && (
                    <p className={s.docHint}>לצרף: {task.doc_hint}</p>
                  )}

                  {task.links && task.links.length > 0 && (
                    <div className={s.links}>
                      {task.links.map((l) => (
                        <a
                          key={`${l.kind}-${l.url}`}
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={s.linkChip}
                          data-kind={l.kind}
                        >
                          <span className={s.linkKind}>{LINK_KIND[l.kind]}</span>
                          {l.label}
                        </a>
                      ))}
                    </div>
                  )}

                  {taskDocs.length > 0 && (
                    <div className={s.docs}>
                      {taskDocs.map((d) => (
                        <button key={d.id} onClick={() => download(d)} className={s.docChip}>
                          {d.filename} · {(d.size_bytes / 1024).toFixed(0)}KB
                        </button>
                      ))}
                    </div>
                  )}

                  <div className={s.taskActions}>
                    <label className={s.uploadBtn}>
                      {busy === task.id ? 'מעלה…' : '+ העלאת מסמך'}
                      <input
                        type="file"
                        accept=".pdf,image/jpeg,image/png,image/heic,image/webp"
                        hidden
                        disabled={busy === task.id}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void upload(task.id, f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>

                  <textarea
                    className={s.note}
                    placeholder="הערה — מה נאמר בטלפון, מספר אסמכתא, מה נשאר לעשות…"
                    value={task.note ?? ''}
                    onChange={(e) => setNote(task.id, e.target.value)}
                    rows={1}
                  />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** הטקסטים בקטלוג הם markdown קל. מסירים סימון במקום להריץ מפרש שלם. */
function stripMarkdown(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\n+/g, ' ');
}
