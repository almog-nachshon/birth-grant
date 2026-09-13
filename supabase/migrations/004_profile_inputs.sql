-- 004_profile_inputs.sql — השדות שהופכים את החישוב לאישי
--
-- עד כאן השאלון אסף נתונים שלא היה להם מקום בבסיס הנתונים: סדר לידה, ריבוי
-- עוברים וקופת חולים נגזרו למשימות ואז נזרקו, ומסך התיק קידד אותם קשיח.
-- בנוסף לא היה שום שדה הכנסה, ולכן דמי הלידה תמיד יצאו null.
--
-- אידמפוטנטי — אפשר להריץ שוב בלי נזק.

-- ─────────────────────────────────────────────────────────────
-- רמת התיק: מה שקובע את גובה המענק ואת החזרי הקופה
-- ─────────────────────────────────────────────────────────────
alter table public.cases
  add column if not exists birth_order    smallint not null default 1,
  add column if not exists multiple_birth boolean  not null default false,
  add column if not exists hmo            text,
  add column if not exists hotel_nights   smallint,
  add column if not exists pregnancy_basket_remaining numeric;

do $$ begin
  alter table public.cases
    add constraint cases_birth_order_chk check (birth_order between 1 and 3);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.cases
    add constraint cases_hotel_nights_chk check (hotel_nights is null or hotel_nights between 0 and 60);
exception when duplicate_object then null; end $$;

comment on column public.cases.birth_order is
  '1 | 2 | 3+ — קובע איזה מפתח מענק לידה נשלף מטבלת השיעורים';
comment on column public.cases.hmo is
  'קופת חולים ברמת התיק. case_persons.hmo נשמר להורה שמבוטח בקופה אחרת';

-- ─────────────────────────────────────────────────────────────
-- רמת ההורה: הקלט הכספי של דמי הלידה
-- הערכים נשמרים כפי שהמשתמש אישר אותם — גם כשמקורם בחילוץ ממסמך.
-- ─────────────────────────────────────────────────────────────
alter table public.case_persons
  add column if not exists monthly_gross                numeric,
  add column if not exists annual_self_employed_income  numeric,
  add column if not exists insured_months_of_14         smallint,
  add column if not exists insured_months_of_22         smallint,
  add column if not exists leave_weeks                  smallint,
  add column if not exists sick_paid_from_day_one       boolean not null default false,
  -- מאיפה הגיע כל שדה: 'manual' | 'document'. מאפשר להציג "נקרא מהתלוש".
  add column if not exists input_sources                jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.case_persons
    add constraint case_persons_gross_chk
    check (monthly_gross is null or (monthly_gross >= 0 and monthly_gross < 1000000));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.case_persons
    add constraint case_persons_annual_chk
    check (annual_self_employed_income is null
           or (annual_self_employed_income >= 0 and annual_self_employed_income < 20000000));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.case_persons
    add constraint case_persons_m14_chk check (insured_months_of_14 is null or insured_months_of_14 between 0 and 14);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.case_persons
    add constraint case_persons_m22_chk check (insured_months_of_22 is null or insured_months_of_22 between 0 and 22);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.case_persons
    add constraint case_persons_leave_weeks_chk check (leave_weeks is null or leave_weeks between 0 and 15);
exception when duplicate_object then null; end $$;

comment on column public.case_persons.monthly_gross is
  'ברוטו חודשי ממוצע ב-3 החודשים שקדמו ליום הקובע. מקור דמי הלידה לשכיר/ה';
comment on column public.case_persons.input_sources is
  'לכל שדה — manual או document. משמש להצגת מקור הנתון ולא לחישוב';

-- ─────────────────────────────────────────────────────────────
-- מסמכים: סוג מוצהר + תוצאת החילוץ
-- הסוג נקבע ע"י המשתמש כשהוא בוחר את משבצת ההעלאה, ומאומת מול מה
-- שהמודל זיהה. אי-התאמה מוצגת לו ולא מתוקנת בשקט.
-- ─────────────────────────────────────────────────────────────
alter table public.case_documents
  add column if not exists kind        text not null default 'other',
  add column if not exists person_role public.parent_role,
  add column if not exists extracted   jsonb,
  add column if not exists extracted_at timestamptz;

do $$ begin
  alter table public.case_documents
    add constraint case_documents_kind_chk check (kind in (
      'payslip',            -- תלוש שכר
      'id_card',            -- תעודת זהות + ספח
      'hospital_discharge', -- מכתב שחרור מבית החולים
      'insurance_policy',   -- פוליסת ביטוח בריאות / קולקטיב
      'tax_assessment',     -- שומת מס
      'employer_letter',    -- אישור מעסיק על הפסקת עבודה
      'bank_details',       -- אישור ניהול חשבון
      'hotel_invoice',      -- חשבונית מלונית
      'bl_letter',          -- מכתב מביטוח לאומי
      'other'
    ));
exception when duplicate_object then null; end $$;

create index if not exists case_documents_kind_idx on public.case_documents(case_id, kind);
