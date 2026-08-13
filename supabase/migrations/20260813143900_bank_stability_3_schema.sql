-- Bank-stability 3.0: compatibility and account-state foundation.
-- Safe to run more than once.

alter table if exists public.credits
  add column if not exists created_at timestamptz;
update public.credits set created_at = now() where created_at is null;
alter table if exists public.credits alter column created_at set default now();
create index if not exists credits_created_at_idx on public.credits (created_at desc);

alter table if exists public.profiles
  add column if not exists status text not null default 'active';
update public.profiles set status = 'active' where status is null or btrim(status) = '';
alter table if exists public.profiles drop constraint if exists profiles_status_check;
alter table if exists public.profiles add constraint profiles_status_check check (status in ('active','frozen','blocked'));
create index if not exists profiles_status_idx on public.profiles (status);

create or replace function public.can_use_bank_account(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = p_user_id and coalesce(p.status,'active') = 'active');
$$;
revoke all on function public.can_use_bank_account(uuid) from public;
grant execute on function public.can_use_bank_account(uuid) to authenticated;

create or replace function public.is_bank_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and lower(coalesce(p.role,'player')) = 'admin');
$$;
revoke all on function public.is_bank_admin() from public;
grant execute on function public.is_bank_admin() to authenticated;

create or replace function public.admin_balance_operation(p_amount numeric,p_description text,p_player_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_balance numeric; v_type text;
begin
  if not public.is_bank_admin() then raise exception 'Недостаточно прав'; end if;
  if p_amount = 0 then raise exception 'Сумма не может быть нулевой'; end if;
  if not public.can_use_bank_account(p_player_id) then raise exception 'Счёт игрока заморожен или заблокирован'; end if;
  if p_amount < 0 and (select balance from public.profiles where id=p_player_id) + p_amount < 0 then raise exception 'Недостаточно средств'; end if;
  update public.profiles set balance=balance+p_amount where id=p_player_id returning balance into v_balance;
  if not found then raise exception 'Игрок не найден'; end if;
  v_type := case when p_amount>0 then 'deposit' else 'withdraw' end;
  insert into public.transactions(from_user,to_user,amount,type,description)
  values(case when p_amount<0 then p_player_id else null end,case when p_amount>0 then p_player_id else null end,abs(p_amount),v_type,coalesce(p_description,'Банковская операция'));
  return jsonb_build_object('success',true,'balance',v_balance,'type',v_type);
end; $$;
revoke all on function public.admin_balance_operation(numeric,text,uuid) from public;
grant execute on function public.admin_balance_operation(numeric,text,uuid) to authenticated;

create or replace function public.admin_issue_penalty(p_amount numeric,p_player_id uuid,p_reason text,p_title text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.is_bank_admin() then raise exception 'Недостаточно прав'; end if;
  if p_amount<=0 then raise exception 'Сумма штрафа должна быть положительной'; end if;
  if not public.can_use_bank_account(p_player_id) then raise exception 'Счёт игрока заморожен или заблокирован'; end if;
  insert into public.fines(user_id,amount,reason,is_paid) values(p_player_id,p_amount,coalesce(nullif(p_reason,''),p_title,'Штраф'),false) returning id into v_id;
  return jsonb_build_object('success',true,'id',v_id);
end; $$;
revoke all on function public.admin_issue_penalty(numeric,uuid,text,text) from public;
grant execute on function public.admin_issue_penalty(numeric,uuid,text,text) to authenticated;

create or replace function public.pay_penalty(p_amount numeric,p_penalty_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_penalty record; v_balance numeric;
begin
  select * into v_penalty from public.fines where id=p_penalty_id for update;
  if not found then raise exception 'Штраф не найден'; end if;
  if v_penalty.user_id<>v_user then raise exception 'Недостаточно прав'; end if;
  if v_penalty.is_paid then raise exception 'Штраф уже оплачен'; end if;
  if p_amount<>v_penalty.amount then raise exception 'Сумма не совпадает со штрафом'; end if;
  if not public.can_use_bank_account(v_user) then raise exception 'Счёт заморожен или заблокирован'; end if;
  if (select balance from public.profiles where id=v_user)<p_amount then raise exception 'Недостаточно средств'; end if;
  update public.profiles set balance=balance-p_amount where id=v_user returning balance into v_balance;
  update public.fines set is_paid=true where id=p_penalty_id;
  insert into public.transactions(from_user,to_user,amount,type,description) values(v_user,null,p_amount,'fine_payment','Оплата штрафа');
  return jsonb_build_object('success',true,'balance',v_balance);
end; $$;
revoke all on function public.pay_penalty(numeric,uuid) from public;
grant execute on function public.pay_penalty(numeric,uuid) to authenticated;

create or replace function public.pay_fine(p_fine_id uuid,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_amount numeric;
begin
  if p_user_id<>auth.uid() then raise exception 'Недостаточно прав'; end if;
  select amount into v_amount from public.fines where id=p_fine_id and user_id=auth.uid() and not is_paid;
  if v_amount is null then raise exception 'Штраф не найден или уже оплачен'; end if;
  return public.pay_penalty(v_amount,p_fine_id);
end; $$;
revoke all on function public.pay_fine(uuid,uuid) from public;
grant execute on function public.pay_fine(uuid,uuid) to authenticated;
