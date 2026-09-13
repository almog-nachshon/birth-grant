-- 007_self_employed_status.sql — רמת העצמאות
--
-- "עצמאי/ת" אינה קטגוריה אחת. ביטוח לאומי מכיר במישהו כעצמאי רק אם הוא
-- עומד בסף שעות או הכנסה, ומי שלא עומד בו מוגדר "עצמאי שאינו עונה
-- להגדרה" — ואז אין לו דמי לידה כלל. עוסק פטור, שמחזור העסקאות שלו
-- מוגבל בחוק, נמצא הרבה פעמים בדיוק על הגבול הזה.
--
-- השדה נשמר כדי להציג אזהרה, לא כדי לחשב ממנו זכאות: הסף תלוי בשעות
-- ובהכנסה בפועל, ולא בסוג הרישום במע"מ.

alter table public.case_persons
  add column if not exists self_employed_status text;

do $$ begin
  alter table public.case_persons
    add constraint case_persons_self_status_chk
    check (self_employed_status is null or self_employed_status in (
      'exempt',    -- עוסק פטור
      'licensed',  -- עוסק מורשה
      'company'    -- חברה בע"מ
    ));
exception when duplicate_object then null; end $$;

comment on column public.case_persons.self_employed_status is
  'רמת הרישום במע"מ. לתצוגת אזהרה בלבד — הזכאות נקבעת לפי שעות והכנסה';
