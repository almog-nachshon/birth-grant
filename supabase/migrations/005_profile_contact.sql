-- 005_profile_contact.sql — פרטי קשר, זהות ההורה, וחודשי ביטוח בשדה אחד
--
-- שלוש בעיות שהתגלו בשימוש:
--   1. לא היה איפה לשמור טלפון, ואין דרך לשלוח תזכורת בלי זה
--   2. יוצר התיק סומן תמיד כיולדת. בן זוג שנרשם ראשון קיבל את התפקיד הלא נכון
--   3. שני שדות נפרדים לחודשי ביטוח (14 ו-22) בלבלו — אף אחד לא יודע
--      לספור שני חלונות שונים בעל פה
--
-- אידמפוטנטי.

alter table public.profiles
  add column if not exists phone text;

comment on column public.profiles.phone is
  'טלפון המשתמש. לתזכורות בלבד, לא נשלח לשום גורם חיצוני';

alter table public.case_persons
  add column if not exists phone text,
  add column if not exists email text,
  -- חודשי ביטוח בשנתיים האחרונות. שדה אחד במקום שניים.
  -- חלון 24 חודשים אינו חלון החוק (10 מתוך 14, או 15 מתוך 22), ולכן
  -- המנוע לעולם לא מסמן תוצאה שנגזרה ממנו כ-calculated.
  add column if not exists insured_months_of_24 smallint;

do $$ begin
  alter table public.case_persons
    add constraint case_persons_m24_chk
    check (insured_months_of_24 is null or insured_months_of_24 between 0 and 24);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.case_persons
    add constraint case_persons_phone_chk
    check (phone is null or length(phone) between 6 and 20);
exception when duplicate_object then null; end $$;

-- העברת הנתון הקיים: מי שכבר מילא חלון 22 לא צריך להקליד מחדש
update public.case_persons
set insured_months_of_24 = insured_months_of_22
where insured_months_of_24 is null and insured_months_of_22 is not null;

update public.case_persons
set insured_months_of_24 = insured_months_of_14
where insured_months_of_24 is null and insured_months_of_14 is not null;

comment on column public.case_persons.insured_months_of_24 is
  'חודשי ביטוח ב-24 החודשים שקדמו ליום הקובע. השדה שהמשתמש ממלא';

-- ─────────────────────────────────────────────────────────────
-- החלפת תפקיד: המשתמש מצהיר אם הוא היולדת או בן/בת הזוג.
-- שתי הכתיבות חייבות לקרות יחד, אחרת רגע אחד שני ההורים מקושרים
-- לאותו משתמש ו-loadCase מחזיר את השורה הלא נכונה.
-- ─────────────────────────────────────────────────────────────
create or replace function public.claim_person_role(target_role public.parent_role)
returns void language plpgsql security invoker set search_path = public as $$
declare
  target_case uuid;
begin
  select case_id into target_case
  from public.case_members
  where user_id = auth.uid()
  limit 1;

  if target_case is null then
    raise exception 'אין תיק למשתמש הזה';
  end if;

  update public.case_persons
  set user_id = null
  where case_id = target_case and user_id = auth.uid();

  update public.case_persons
  set user_id = auth.uid()
  where case_id = target_case and role = target_role;
end $$;

revoke all on function public.claim_person_role(public.parent_role) from public;
grant execute on function public.claim_person_role(public.parent_role) to authenticated;
