-- 003_storage.sql — אחסון מסמכים
-- הדלי פרטי לחלוטין. אין URL ציבורי לשום קובץ — הורדה רק דרך signed URL קצר-תוקף.
-- מבנה נתיב: case/{case_id}/{uuid}-{filename}
-- הסגמנט השני בנתיב הוא ה-case_id, ועליו נשענת כל בדיקת ההרשאה.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'case-docs',
  'case-docs',
  false,                          -- לעולם לא ציבורי
  15728640,                       -- 15MB
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/webp'
  ]
  -- שים לב: SVG ו-HTML לא ברשימה בכוונה — הם וקטור XSS כשמגישים אותם inline.
)
on conflict (id) do update
  set file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = false;

-- חילוץ ה-case_id מהנתיב באופן בטוח (מחזיר null אם הנתיב לא בפורמט)
create or replace function public.storage_case_id(path text)
returns uuid
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  parts := string_to_array(path, '/');
  if array_length(parts, 1) < 3 or parts[1] <> 'case' then
    return null;
  end if;
  return parts[2]::uuid;
exception when others then
  return null;
end $$;

-- ─────────────────────────────────────────────────────────────
-- הרשאות על האובייקטים עצמם
-- ─────────────────────────────────────────────────────────────
create policy case_docs_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'case-docs'
    and public.is_case_member(public.storage_case_id(name))
  );

create policy case_docs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'case-docs'
    and public.is_case_member(public.storage_case_id(name))
    and owner = auth.uid()
  );

-- אין policy ל-update: מסמך לא נערך במקום, מעלים חדש ומוחקים ישן.
create policy case_docs_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'case-docs'
    and public.is_case_member(public.storage_case_id(name))
  );

-- ─────────────────────────────────────────────────────────────
-- מחיקת שורת המסמך גוררת מחיקת הקובץ בפועל.
-- בלי זה נשארים קבצים יתומים שממשיכים להחזיק מידע רגיש ולעלות כסף.
-- ─────────────────────────────────────────────────────────────
create or replace function public.delete_storage_object()
returns trigger language plpgsql security definer set search_path = public, storage as $$
begin
  delete from storage.objects
  where bucket_id = 'case-docs' and name = old.storage_path;
  return old;
end $$;

create trigger case_documents_cleanup
  after delete on public.case_documents
  for each row execute function public.delete_storage_object();
