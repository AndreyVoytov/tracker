-- Run in the same Supabase project used by mushroomsSveta/.pages-deploy/mechanics.
-- Visitors can read and edit tracker catalog data and upload covers without signing in.

create table if not exists public.project_tracker_projects (
  project_id text primary key,
  title text not null,
  folder text not null,
  genre text not null,
  description text not null,
  platforms text[] not null default '{}',
  stage text not null,
  icon text not null,
  url text,
  updated_at timestamptz not null default now()
);

alter table public.project_tracker_projects enable row level security;
revoke all on public.project_tracker_projects from public, anon, authenticated;
grant select on public.project_tracker_projects to anon, authenticated;
grant insert, update, delete on public.project_tracker_projects to anon, authenticated;

drop policy if exists "Anyone can read project tracker catalog" on public.project_tracker_projects;
create policy "Anyone can read project tracker catalog"
  on public.project_tracker_projects
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Owner can manage project tracker catalog" on public.project_tracker_projects;
drop policy if exists "Anyone can manage project tracker catalog" on public.project_tracker_projects;
create policy "Anyone can manage project tracker catalog"
  on public.project_tracker_projects
  for all
  to anon, authenticated
  using (true)
  with check (true);

insert into storage.buckets (id, name, public)
values ('project-tracker-assets', 'project-tracker-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "Owner can upload tracker project assets" on storage.objects;
drop policy if exists "Anyone can upload tracker project assets" on storage.objects;
create policy "Anyone can upload tracker project assets"
  on storage.objects
  for insert
  to anon, authenticated
  with check (
    bucket_id = 'project-tracker-assets'
  );

drop policy if exists "Owner can update tracker project assets" on storage.objects;
drop policy if exists "Anyone can update tracker project assets" on storage.objects;
create policy "Anyone can update tracker project assets"
  on storage.objects
  for update
  to anon, authenticated
  using (
    bucket_id = 'project-tracker-assets'
  )
  with check (
    bucket_id = 'project-tracker-assets'
  );

drop policy if exists "Owner can delete tracker project assets" on storage.objects;
drop policy if exists "Anyone can delete tracker project assets" on storage.objects;
create policy "Anyone can delete tracker project assets"
  on storage.objects
  for delete
  to anon, authenticated
  using (
    bucket_id = 'project-tracker-assets'
  );
