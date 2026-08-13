-- ============================================================
-- STABILITY BANK 3.0 — REPAIR CURRENT SUPABASE
--
-- This script fixes the exact 404 errors from the current site:
--   /rpc/admin_balance_operation
--   /rpc/admin_update_player_profile
-- and restores transaction/history writes used by those operations.
--
-- Run this ENTIRE file once in Supabase SQL Editor for the same
-- project used by the website (bpodhjlqzfxesxjduujz.supabase.co).
-- ============================================================

-- 1. Compatibility columns used by the final UI.
alter table if exists public.profiles add column if not exists status text not null default 'active';
alter table if exists public.profiles add column if not exists birth_date date;
alter table if exists public.profiles add column if not exists passport_number text;
alter table if exists public.credits add column if not exists created_at timestamptz default now();
update public.credits set created_at=now() where created_at is null;

-- 2. Admin check.
create or replace function public.is_bank_admin()
returns boolean
language sql
security definer
stable
set search_path=public
as $$
  select exists (
    select 1 from public.profiles
    where id=auth.uid() and lower(coalesce(role,'player'))='admin'
  );
$$;
grant execute on function public.is_bank_admin() to authenticated;

-- 3. THE MISSING RPC FROM THE 404 ERROR.
-- Positive amount = deposit, negative amount = withdrawal.
create or replace function public.admin_balance_operation(
  p_amount numeric,
  p_description text,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_old numeric;
  v_new numeric;
  v_amount numeric:=coalesce(p_amount,0);
  v_status text;
begin
  if not public.is_bank_admin() then raise exception 'Недостаточно прав'; end if;
  if v_amount=0 then raise exception 'Сумма не может быть нулевой'; end if;

  select coalesce(balance,0),coalesce(status,'active')
    into v_old,v_status
    from public.profiles
   where id=p_player_id
   for update;

  if not found then raise exception 'Игрок не найден'; end if;
  if v_status<>'active' then raise exception 'Счёт игрока заморожен или заблокирован'; end if;

  v_new:=v_old+v_amount;
  if v_new<0 then raise exception 'Недостаточно средств у игрока'; end if;

  update public.profiles set balance=v_new where id=p_player_id;

  insert into public.transactions(from_user,to_user,amount,type,description)
  values(
    case when v_amount<0 then p_player_id else auth.uid() end,
    case when v_amount>0 then p_player_id else auth.uid() end,
    abs(v_amount),
    case when v_amount>0 then 'deposit' else 'withdraw' end,
    coalesce(nullif(trim(p_description),''),'Банковская операция')
  );

  return jsonb_build_object(
    'success',true,
    'amount',v_amount,
    'old_balance',v_old,
    'new_balance',v_new
  );
end;
$$;
revoke all on function public.admin_balance_operation(numeric,text,uuid) from public;
grant execute on function public.admin_balance_operation(numeric,text,uuid) to authenticated;

-- 4. THE OTHER MISSING RPC FROM THE 404 ERROR.
create or replace function public.admin_update_player_profile(
  p_player_id uuid,
  p_full_name text,
  p_birth_date date,
  p_passport_number text,
  p_username text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_bank_admin() then raise exception 'Недостаточно прав'; end if;

  update public.profiles
     set full_name=coalesce(nullif(trim(p_full_name),''),full_name),
         birth_date=p_birth_date,
         passport_number=coalesce(nullif(trim(p_passport_number),''),passport_number),
         username=coalesce(nullif(trim(p_username),''),username)
   where id=p_player_id;

  if not found then raise exception 'Игрок не найден'; end if;
  return jsonb_build_object('success',true,'player_id',p_player_id);
end;
$$;
revoke all on function public.admin_update_player_profile(uuid,text,date,text,text) from public;
grant execute on function public.admin_update_player_profile(uuid,text,date,text,text) to authenticated;

-- 5. History must be readable by authenticated users through the app.
-- Mutations still happen only through SECURITY DEFINER RPCs.
alter table if exists public.transactions enable row level security;
drop policy if exists "bank users read own transactions" on public.transactions;
create policy "bank users read own transactions"
  on public.transactions for select to authenticated
  using (from_user=auth.uid() or to_user=auth.uid() or public.is_bank_admin());

-- 6. Make the exact history-management RPCs available.
create or replace function public.admin_delete_transaction(p_transaction_id text)
returns jsonb
language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_bank_admin() then raise exception 'Недостаточно прав'; end if;
  delete from public.transactions where id::text=p_transaction_id;
  if not found then raise exception 'Операция не найдена'; end if;
  return jsonb_build_object('success',true,'deleted_id',p_transaction_id);
end;
$$;
grant execute on function public.admin_delete_transaction(text) to authenticated;

create or replace function public.admin_clear_player_history(p_player_id uuid)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_count integer;
begin
  if not public.is_bank_admin() then raise exception 'Недостаточно прав'; end if;
  delete from public.transactions where from_user=p_player_id or to_user=p_player_id;
  get diagnostics v_count=row_count;
  return jsonb_build_object('success',true,'deleted_count',v_count);
end;
$$;
grant execute on function public.admin_clear_player_history(uuid) to authenticated;

-- 7. Player-to-player transfer RPC used by the player UI.
create or replace function public.transfer_funds(p_from uuid,p_to uuid,p_amount numeric)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_amount numeric:=coalesce(p_amount,0); v_balance numeric;
begin
  if auth.uid() is distinct from p_from then raise exception 'Недостаточно прав'; end if;
  if p_from=p_to then raise exception 'Нельзя переводить самому себе'; end if;
  if v_amount<=0 then raise exception 'Сумма должна быть больше нуля'; end if;
  if not exists(select 1 from public.profiles where id=p_from and coalesce(status,'active')='active') then raise exception 'Ваш счёт недоступен'; end if;
  if not exists(select 1 from public.profiles where id=p_to and coalesce(status,'active')='active') then raise exception 'Получатель не найден или недоступен'; end if;
  select coalesce(balance,0) into v_balance from public.profiles where id=p_from for update;
  if v_balance<v_amount then raise exception 'Недостаточно средств'; end if;
  update public.profiles set balance=coalesce(balance,0)-v_amount where id=p_from;
  update public.profiles set balance=coalesce(balance,0)+v_amount where id=p_to;
  insert into public.transactions(from_user,to_user,amount,type,description)
  values(p_from,p_to,v_amount,'transfer','Перевод игроку');
  return jsonb_build_object('success',true,'amount',v_amount);
end;
$$;
grant execute on function public.transfer_funds(uuid,uuid,numeric) to authenticated;

-- 8. Force PostgREST to see every RPC immediately.
notify pgrst,'reload schema';

-- Verification queries. They should return rows/functions, not 404.
select n.nspname as schema_name,p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('admin_balance_operation','admin_update_player_profile','admin_delete_transaction','admin_clear_player_history','transfer_funds')
order by p.proname;
