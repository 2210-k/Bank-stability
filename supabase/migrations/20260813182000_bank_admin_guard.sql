-- Canonical admin guard used by all Bank-stability 3.0 admin RPCs.
-- Safe to run repeatedly.

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

notify pgrst, 'reload schema';
