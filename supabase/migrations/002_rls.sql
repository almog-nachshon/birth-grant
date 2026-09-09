-- 002_rls.sql — הרשאות ברמת שורה
-- כלל היסוד: כל גישה לנתוני תיק עוברת דרך is_case_member().
-- הפונקציה היא SECURITY DEFINER בכוונה — בלי זה, policy על case_members
-- שקוראת מ-case_members יוצרת רקורסיה אינסופית (התקלה הקלאסית ב-Supabase).

-- ─────────────────────────────────────────────────────────────
-- פונקציות עזר
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_case_member(c uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.case_members
    where case_id = c and user_id = auth.uid()
  );
$$;

create or replace function public.is_case_owner(c uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.case_members
    where case_id = c and user_id = auth.uid() and role = 'owner'
  );
$$;

revoke execute on function public.is_case_member(uuid) from public;
revoke execute on function public.is_case_owner(uuid)  from public;
grant  execute on function public.is_case_member(uuid) to authenticated;
grant  execute on function public.is_case_owner(uuid)  to authenticated;

-- ─────────────────────────────────────────────────────────────
-- פרופילים: כל אחד רואה ועורך רק את עצמו
-- ─────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- תיקים
-- ─────────────────────────────────────────────────────────────
alter table public.cases enable row level security;

create policy cases_select_member on public.cases
  for select to authenticated using (public.is_case_member(id));

create policy cases_insert_own on public.cases
  for insert to authenticated with check (created_by = auth.uid());

create policy cases_update_member on public.cases
  for update to authenticated
  using (public.is_case_member(id)) with check (public.is_case_member(id));

-- מחיקת תיק — לבעלים בלבד
create policy cases_delete_owner on public.cases
  for delete to authenticated using (public.is_case_owner(id));

-- ─────────────────────────────────────────────────────────────
-- חברוּת בתיק
-- ─────────────────────────────────────────────────────────────
alter table public.case_members enable row level security;

create policy case_members_select on public.case_members
  for select to authenticated using (public.is_case_member(case_id));

-- שורת הבעלים הראשונה נוצרת ע"י טריגר (למטה), לא ע"י הלקוח.
create policy case_members_delete_owner on public.case_members
  for delete to authenticated
  using (public.is_case_owner(case_id) and user_id <> auth.uid());

-- יוצר התיק הופך אוטומטית לבעלים — מונע מצב של תיק בלי חברים
create or replace function public.add_creator_as_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.case_members (case_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;
  return new;
end $$;

create trigger cases_add_owner after insert on public.cases
  for each row execute function public.add_creator_as_owner();

-- ─────────────────────────────────────────────────────────────
-- הזמנות: חברי התיק רואים; המימוש עצמו דרך RPC בלבד
-- (הצטרפות לא יכולה לעבור ב-policy רגילה — המשתמש עדיין לא חבר)
-- ─────────────────────────────────────────────────────────────
alter table public.case_invites enable row level security;

create policy case_invites_select_member on public.case_invites
  for select to authenticated using (public.is_case_member(case_id));

create policy case_invites_insert_owner on public.case_invites
  for insert to authenticated
  with check (public.is_case_owner(case_id) and invited_by = auth.uid());

create policy case_invites_delete_owner on public.case_invites
  for delete to authenticated using (public.is_case_owner(case_id));

-- מימוש הזמנה: מקבל את האסימון הגולמי, משווה מול ה-hash השמור.
create or replace function public.redeem_invite(raw_token text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  inv public.case_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into inv from public.case_invites
  where token_hash = encode(digest(raw_token, 'sha256'), 'hex')
  limit 1;

  if not found then
    raise exception 'invite not found';
  end if;
  if inv.accepted_at is not null then
    raise exception 'invite already used';
  end if;
  if inv.expires_at < now() then
    raise exception 'invite expired';
  end if;

  insert into public.case_members (case_id, user_id, role)
  values (inv.case_id, auth.uid(), 'partner')
  on conflict (case_id, user_id) do nothing;

  update public.case_invites
    set accepted_at = now(), accepted_by = auth.uid()
    where id = inv.id;

  insert into public.case_events (case_id, actor_id, action)
  values (inv.case_id, auth.uid(), 'member.joined');

  return inv.case_id;
end $$;

revoke execute on function public.redeem_invite(text) from public;
grant  execute on function public.redeem_invite(text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- נתוני התיק: אותה policy חוזרת על כל הטבלאות
-- ─────────────────────────────────────────────────────────────
alter table public.case_persons   enable row level security;
alter table public.case_tasks     enable row level security;
alter table public.case_documents enable row level security;
alter table public.case_events    enable row level security;

create policy case_persons_all on public.case_persons
  for all to authenticated
  using (public.is_case_member(case_id)) with check (public.is_case_member(case_id));

create policy case_tasks_all on public.case_tasks
  for all to authenticated
  using (public.is_case_member(case_id)) with check (public.is_case_member(case_id));

create policy case_documents_all on public.case_documents
  for all to authenticated
  using (public.is_case_member(case_id)) with check (public.is_case_member(case_id));

-- יומן: קריאה בלבד ללקוח. כתיבה רק דרך טריגרים/RPC, כדי שלא ניתן לזייף ביקורת.
create policy case_events_select on public.case_events
  for select to authenticated using (public.is_case_member(case_id));

-- ─────────────────────────────────────────────────────────────
-- קטלוג ושיעורים: קריאה ציבורית לגרסאות שפורסמו, כתיבה רק ע"י service_role
-- ─────────────────────────────────────────────────────────────
alter table public.catalog_versions enable row level security;
alter table public.catalog_phases   enable row level security;
alter table public.catalog_tasks    enable row level security;
alter table public.rates            enable row level security;

create policy catalog_versions_read on public.catalog_versions
  for select to anon, authenticated using (published_at is not null);

create policy catalog_phases_read on public.catalog_phases
  for select to anon, authenticated using (
    exists (select 1 from public.catalog_versions v
            where v.id = version_id and v.published_at is not null));

create policy catalog_tasks_read on public.catalog_tasks
  for select to anon, authenticated using (
    exists (select 1 from public.catalog_versions v
            where v.id = version_id and v.published_at is not null));

create policy rates_read on public.rates
  for select to anon, authenticated using (true);
