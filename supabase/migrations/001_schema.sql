-- 001_schema.sql — מבנה בסיס הנתונים
-- עיקרון: הפרדה בין "קטלוג" (תוכן כללי, גרסאי, זהה לכולם)
-- לבין "תיק" (case — הזוג, הפרופיל שלו וההתקדמות שלו).
-- יחידת הבידוד היא התיק, לא המשתמש: שני אנשים חולקים תיק אחד.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- טריגר עזר: updated_at
-- ─────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────
-- משתמשים
-- auth.users מנוהל ע"י Supabase (כולל Google OAuth).
-- profiles הוא ההרחבה שלנו, נוצר אוטומטית בהרשמה.
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  locale       text not null default 'he',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- יצירת פרופיל אוטומטית בהרשמה, כולל שאיבת שם ותמונה מ-Google
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- תיקים וחברוּת
-- ─────────────────────────────────────────────────────────────
create type public.case_status as enum ('active', 'archived');

create table public.cases (
  id                uuid primary key default gen_random_uuid(),
  title             text not null default 'התיק שלנו',
  due_date          date,                       -- תאריך לידה משוער
  actual_birth_date date,                       -- מתעדכן אחרי הלידה; מזיז את כל לוח הזמנים
  status            public.case_status not null default 'active',
  catalog_version_id uuid,                      -- FK נוסף בהמשך הקובץ (תלות מעגלית)
  created_by        uuid not null references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- מדיניות שמירה: מתי מותר למחוק אוטומטית
  purge_after       timestamptz
);

create trigger cases_touch before update on public.cases
  for each row execute function public.touch_updated_at();

create type public.member_role as enum ('owner', 'partner');

create table public.case_members (
  case_id     uuid not null references public.cases(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.member_role not null default 'partner',
  accepted_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  primary key (case_id, user_id)
);

create index case_members_user_idx on public.case_members(user_id);

-- הזמנת בן/בת זוג. לא יוצרים משתמש מראש — רק אסימון חד-פעמי.
create table public.case_invites (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.cases(id) on delete cascade,
  email      citext,
  token_hash text not null unique,              -- שומרים hash, לא את האסימון עצמו
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index case_invites_case_idx on public.case_invites(case_id);

-- ─────────────────────────────────────────────────────────────
-- פרופיל התיק: שני צירים עצמאיים — תפקיד וסוג העסקה
-- ─────────────────────────────────────────────────────────────
create type public.parent_role     as enum ('birthing_parent', 'partner');
create type public.employment_type as enum ('employee', 'self_employed', 'both', 'unemployed');

create table public.case_persons (
  id                  uuid primary key default gen_random_uuid(),
  case_id             uuid not null references public.cases(id) on delete cascade,
  role                public.parent_role not null,
  user_id             uuid references auth.users(id) on delete set null,  -- מי מהמשתמשים זה
  display_name        text,
  employment          public.employment_type not null default 'employee',
  employer_name       text,
  hmo                 text,                     -- קופת חולים
  has_employer_policy boolean not null default false,
  takes_leave         boolean not null default false,  -- רלוונטי ל-partner
  work_stop_date      date,                     -- "היום הקובע" — קריטי לטופס 360
  leave_start         date,
  leave_end           date,
  extra               jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (case_id, role)
);

create trigger case_persons_touch before update on public.case_persons
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- קטלוג — תוכן ציבורי, גרסאי, לקריאה בלבד למשתמשים
-- ─────────────────────────────────────────────────────────────
create table public.catalog_versions (
  id           uuid primary key default gen_random_uuid(),
  semver       text not null unique,            -- "2026.1.0"
  published_at timestamptz,                     -- null = טיוטה
  notes        text,
  created_at   timestamptz not null default now()
);

create table public.catalog_phases (
  id         uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.catalog_versions(id) on delete cascade,
  key        text not null,
  title      text not null,
  sort       int  not null default 0,
  unique (version_id, key)
);

create table public.catalog_tasks (
  id           uuid primary key default gen_random_uuid(),
  version_id   uuid not null references public.catalog_versions(id) on delete cascade,
  key          text not null,
  phase_key    text not null,
  role         text not null,                   -- birthing_parent | partner | shared | any
  title        text not null,
  body         text,                            -- markdown, עם {{rate_key}} להצבה
  requires_doc boolean not null default false,
  doc_hint     text,
  form_ref     text,                            -- '355' | '360'
  source_url   text,
  critical     boolean not null default false,
  optional     boolean not null default false,
  applies_when jsonb not null default '{}'::jsonb,
  date_rule    jsonb,
  sort         int not null default 0,
  unique (version_id, key),
  foreign key (version_id, phase_key)
    references public.catalog_phases(version_id, key) on delete cascade
);

create index catalog_tasks_version_idx on public.catalog_tasks(version_id);

-- טבלת השיעורים: כל מספר שמתיישן, במקום אחד, עם תוקף
create table public.rates (
  id             uuid primary key default gen_random_uuid(),
  key            text not null,
  value          numeric,                       -- null = טרם אומת, לא להציג
  unit           text not null default 'ILS',
  label          text,
  scope          text,                          -- למשל 'meuhedet_sia'
  confidence     text,                          -- 'needs_verification' | 'approx' | null
  effective_from date not null,
  effective_to   date,
  created_at     timestamptz not null default now(),
  unique (key, scope, effective_from)
);

create index rates_lookup_idx on public.rates(key, effective_from desc);

alter table public.cases
  add constraint cases_catalog_version_fk
  foreign key (catalog_version_id) references public.catalog_versions(id);

-- ─────────────────────────────────────────────────────────────
-- התקדמות התיק — materialized מהקטלוג, לא מחושב בכל טעינה
-- כך שהערות וסטטוסים שורדים פרסום גרסת קטלוג חדשה.
-- ─────────────────────────────────────────────────────────────
create type public.task_status as enum ('todo', 'in_progress', 'done', 'not_relevant');

create table public.case_tasks (
  id                 uuid primary key default gen_random_uuid(),
  case_id            uuid not null references public.cases(id) on delete cascade,
  catalog_key        text,                      -- null עבור משימה שהזוג הוסיף
  catalog_version_id uuid references public.catalog_versions(id),
  assigned_person_id uuid references public.case_persons(id) on delete set null,
  title              text not null,             -- snapshot, כדי שהמשימה תישאר יציבה
  body               text,
  requires_doc       boolean not null default false,
  status             public.task_status not null default 'todo',
  due_at             date,                      -- מחושב מ-date_rule
  due_kind           text,                      -- due | deadline | window_start
  completed_at       timestamptz,
  completed_by       uuid references auth.users(id),
  note               text,
  is_custom          boolean not null default false,
  sort               int not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (case_id, catalog_key)
);

create index case_tasks_case_idx on public.case_tasks(case_id, status);
create index case_tasks_due_idx  on public.case_tasks(due_at) where status <> 'done';

create trigger case_tasks_touch before update on public.case_tasks
  for each row execute function public.touch_updated_at();

-- חותמת השלמה אוטומטית
create or replace function public.stamp_completion()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and (old.status is distinct from 'done') then
    new.completed_at = now();
    new.completed_by = auth.uid();
  elsif new.status <> 'done' then
    new.completed_at = null;
    new.completed_by = null;
  end if;
  return new;
end $$;

create trigger case_tasks_stamp before update on public.case_tasks
  for each row execute function public.stamp_completion();

-- ─────────────────────────────────────────────────────────────
-- מסמכים — המטא-דאטה כאן, הקובץ עצמו ב-Storage
-- ─────────────────────────────────────────────────────────────
create table public.case_documents (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.cases(id) on delete cascade,
  case_task_id uuid references public.case_tasks(id) on delete set null,
  storage_path text not null unique,            -- case/{case_id}/{uuid}-{filename}
  filename     text not null,
  mime         text not null,
  size_bytes   bigint not null,
  uploaded_by  uuid not null references auth.users(id),
  created_at   timestamptz not null default now()
);

create index case_documents_case_idx on public.case_documents(case_id);
create index case_documents_task_idx on public.case_documents(case_task_id);

-- ─────────────────────────────────────────────────────────────
-- יומן — מי עשה מה. משמש גם לפיד המשותף וגם כביקורת גישה.
-- ─────────────────────────────────────────────────────────────
create table public.case_events (
  id         bigserial primary key,
  case_id    uuid not null references public.cases(id) on delete cascade,
  actor_id   uuid references auth.users(id) on delete set null,
  action     text not null,                     -- task.completed | doc.uploaded | member.joined ...
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index case_events_case_idx on public.case_events(case_id, created_at desc);
