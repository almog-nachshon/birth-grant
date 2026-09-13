-- 006_fix_case_insert.sql — תיקון חסימת יצירת תיק, ואחוזי נכות
--
-- הבאג: יצירת תיק נכשלה תמיד עם
--   new row violates row-level security policy for table "cases"
--
-- למה: הקוד עושה INSERT ... RETURNING. Postgres מחיל על RETURNING את
-- מדיניות ה-SELECT, שהיא is_case_member(id). שורת החברוּת נוצרת בטריגר
-- AFTER INSERT שרץ בסוף הפקודה — ו-is_case_member היא STABLE ורואה את
-- הצילום מתחילת הפקודה. כלומר בשנייה שבה RETURNING נבדק, המשתמש עדיין
-- אינו חבר בתיק שהוא בדיוק יצר, והשורה נדחית.
--
-- התיקון: מי שיצר תיק רואה אותו תמיד. זה נכון סמנטית בפני עצמו,
-- ולא תלוי בסדר הריצה של טריגרים.

create policy cases_select_creator on public.cases
  for select to authenticated using (created_by = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- אחוזי נכות
-- דגל בוליאני לא מספיק: חלק מהזכויות נפתחות רק מעל סף אחוזים,
-- והצירוף של כמה ליקויים אינו סכום פשוט אלא חישוב משוקלל של
-- הוועדה. לכן נשמרים גם האחוז המשוקלל הסופי וגם הפירוט.
-- ─────────────────────────────────────────────────────────────
alter table public.case_persons
  add column if not exists disability_percent_bl  smallint,
  add column if not exists disability_percent_mod smallint,
  -- [{ "condition": "PTSD", "percent": 30 }, ...] — כפי שמופיע בפרוטוקול
  add column if not exists disability_items jsonb not null default '[]'::jsonb;

do $$ begin
  alter table public.case_persons
    add constraint case_persons_dis_bl_chk
    check (disability_percent_bl is null or disability_percent_bl between 0 and 100);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.case_persons
    add constraint case_persons_dis_mod_chk
    check (disability_percent_mod is null or disability_percent_mod between 0 and 100);
exception when duplicate_object then null; end $$;

comment on column public.case_persons.disability_percent_bl is
  'אחוז הנכות המשוקלל שנקבע בביטוח לאומי. לא סכום הליקויים';
comment on column public.case_persons.disability_items is
  'פירוט הליקויים מהפרוטוקול. מוצג למשתמש, לא מחושב ממנו אחוז';

-- ─────────────────────────────────────────────────────────────
-- פרוטוקול הוועדה כסוג מסמך
-- ─────────────────────────────────────────────────────────────
alter table public.case_documents drop constraint if exists case_documents_kind_chk;

alter table public.case_documents
  add constraint case_documents_kind_chk check (kind in (
    'payslip',
    'id_card',
    'hospital_discharge',
    'insurance_policy',
    'tax_assessment',
    'employer_letter',
    'bank_details',
    'hotel_invoice',
    'bl_letter',
    'disability_protocol',   -- פרוטוקול ועדה רפואית / הודעה על אחוזי נכות
    'other'
  ));
