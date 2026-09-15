-- 008_task_links.sql — טפסים וקישורים רשמיים ברמת המשימה
--
-- עד כאן המשימה אמרה "למלא טופס 355" ולא אמרה איפה הוא. הקישורים
-- נשמרים על שורת המשימה ולא נקראים מהקטלוג בזמן הצגה, מאותה סיבה
-- שהכותרת והגוף נשמרים: תיק שנפתח היום צריך להישאר יציב גם אחרי
-- שפורסמה גרסת קטלוג חדשה.
--
-- kind של כל קישור:
--   online — טופס שאפשר למלא ולשלוח ישירות באינטרנט
--   form   — טופס PDF להורדה ומילוי ידני
--   info   — דף הסבר רשמי

alter table public.case_tasks
  add column if not exists doc_hint text,
  add column if not exists links jsonb not null default '[]'::jsonb;

-- אותו שדה גם במראה של הקטלוג בבסיס הנתונים, שממנה יעבוד עורך
-- הקטלוג העתידי. ה-seed כותב אליה מ-content/catalog.json.
alter table public.catalog_tasks
  add column if not exists links jsonb not null default '[]'::jsonb;

comment on column public.catalog_tasks.links is
  'מערך [{label, url, kind}] — טפסים וקישורים רשמיים';

comment on column public.case_tasks.doc_hint is
  'איזה מסמך בדיוק צריך לצרף — snapshot מהקטלוג';
comment on column public.case_tasks.links is
  'מערך [{label, url, kind}] — טפסים וקישורים רשמיים, snapshot מהקטלוג';
