-- Run this in the same Supabase project used by mushroomsSveta/.pages-deploy/mechanics.
-- Tracker data can be read and edited without signing in.

create table if not exists public.project_tracker_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  title text not null check (char_length(title) between 1 and 240),
  details text not null default '',
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_tracker_tasks_project_created_idx
  on public.project_tracker_tasks (project_id, created_at);

alter table public.project_tracker_tasks enable row level security;
revoke all on public.project_tracker_tasks from public, anon, authenticated;
grant select, insert, update, delete on public.project_tracker_tasks to anon, authenticated;

drop policy if exists "Owner can manage project tracker tasks" on public.project_tracker_tasks;
drop policy if exists "Anyone can manage project tracker tasks" on public.project_tracker_tasks;
create policy "Anyone can manage project tracker tasks"
  on public.project_tracker_tasks
  for all
  to anon, authenticated
  using (true)
  with check (true);

create table if not exists public.project_tracker_progress (
  project_id text primary key,
  gameplay_readiness integer not null check (gameplay_readiness between 0 and 100),
  updated_at timestamptz not null default now()
);

alter table public.project_tracker_progress enable row level security;
revoke all on public.project_tracker_progress from public, anon, authenticated;
grant select, insert, update on public.project_tracker_progress to anon, authenticated;

drop policy if exists "Owner can manage project tracker progress" on public.project_tracker_progress;
drop policy if exists "Anyone can manage project tracker progress" on public.project_tracker_progress;
create policy "Anyone can manage project tracker progress"
  on public.project_tracker_progress
  for all
  to anon, authenticated
  using (true)
  with check (true);
