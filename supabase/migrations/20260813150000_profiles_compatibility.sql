-- Compatibility migration for existing Bank-stability databases.
-- Safe to run repeatedly.

alter table if exists public.profiles
  add column if not exists created_at timestamptz not null default now();

update public.profiles
set created_at = now()
where created_at is null;

alter table if exists public.profiles
  add column if not exists status text not null default 'active';

update public.profiles
set status = 'active'
where status is null or btrim(status) = '';

alter table if exists public.profiles
  drop constraint if exists profiles_status_check;

alter table if exists public.profiles
  add constraint profiles_status_check
  check (status in ('active','frozen','blocked'));

create index if not exists profiles_created_at_idx
  on public.profiles(created_at desc);

create index if not exists profiles_status_idx
  on public.profiles(status);
