-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- One row per signed-in user per page. Each user can only see and change their own rows.

create table if not exists public.page_state (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  page       text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, page)
);

alter table public.page_state enable row level security;

drop policy if exists "read own rows"   on public.page_state;
drop policy if exists "insert own rows" on public.page_state;
drop policy if exists "update own rows" on public.page_state;
drop policy if exists "delete own rows" on public.page_state;

create policy "read own rows"   on public.page_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own rows" on public.page_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own rows" on public.page_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own rows" on public.page_state for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.page_state to authenticated;
