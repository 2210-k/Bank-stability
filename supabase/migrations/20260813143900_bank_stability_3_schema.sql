-- Bank-stability 3.0: compatibility and account-state foundation.
-- Safe to run more than once.

-- Credits are read by the 3.0 dashboard ordered by created_at.
alter table if exists public.credits
  add column if not exists created_at timestamptz;

update public.credits
set created_at = now()
where created_at is null;

alter table if exists public.credits
  alter column created_at set default now();

create index if not exists credits_created_at_idx
  on public.credits (created_at desc);

-- Account state is enforced server-side by financial RPCs.
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

create index if not exists profiles_status_idx
  on public.profiles (status);

-- Canonical status helper for SECURITY DEFINER financial functions.
create or replace function public.can_use_bank_account(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and coalesce(p.status, 'active') = 'active'
  );
$$;

revoke all on function public.can_use_bank_account(uuid) from public;
grant execute on function public.can_use_bank_account(uuid) to authenticated;

-- Explicit admin predicate. The application already stores the role in profiles.
create or replace function public.is_bank_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, 'player')) = 'admin'
  );
$$;

revoke all on function public.is_bank_admin() from public;
grant execute on function public.is_bank_admin() to authenticated;
