-- Canonical RPC repair for the final admin UI.
-- These functions are deliberately named exactly as the client calls them.

create or replace function public.admin_balance_operation(
  p_amount numeric,
  p_description text,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_new numeric;
  v_type text;
  v_tx_id text;
begin
  if not public.is_bank_admin() then raise exception 'Недостаточно прав'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'Сумма должна быть не равна нулю'; end if;
  if not exists(select 1 from public.profiles where id = p_player_id) then raise exception 'Игрок не найден'; end if;

  select coalesce(balance,0) into v_balance from public.profiles where id=p_player_id for update;
  v_new := v_balance + p_amount;
  if v_new < 0 then raise exception 'Недостаточно средств на счёте игрока'; end if;

  update public.profiles set balance=v_new where id=p_player_id;
  v_type := case when p_amount > 0 then 'deposit' else 'withdraw' end;

  insert into public.transactions(from_user,to_user,amount,type,description)
  values(null, case when p_amount > 0 then p_player_id else null end, abs(p_amount), v_type, coalesce(nullif(trim(p_description),''),case when p_amount>0 then 'Пополнение' else 'Снятие' end))
  returning id::text into v_tx_id;

  return jsonb_build_object('success',true,'player_id',p_player_id,'old_balance',v_balance,'new_balance',v_new,'amount',p_amount,'transaction_id',v_tx_id);
end;
$$;
revoke all on function public.admin_balance_operation(numeric,text,uuid) from public;
grant execute on function public.admin_balance_operation(numeric,text,uuid) to authenticated;

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
set search_path = public
as $$
begin
  if not public.is_bank_admin() then raise exception 'Недостаточно прав'; end if;
  if not exists(select 1 from public.profiles where id=p_player_id) then raise exception 'Игрок не найден'; end if;
  update public.profiles
  set full_name=coalesce(nullif(trim(p_full_name),''),full_name),
      birth_date=p_birth_date,
      passport_number=coalesce(nullif(trim(p_passport_number),''),passport_number),
      username=coalesce(nullif(trim(p_username),''),username)
  where id=p_player_id;
  return jsonb_build_object('success',true,'player_id',p_player_id);
end;
$$;
revoke all on function public.admin_update_player_profile(uuid,text,date,text,text) from public;
grant execute on function public.admin_update_player_profile(uuid,text,date,text,text) to authenticated;

-- Make transaction history reliable for every admin balance change.
-- Notification trigger is already created by the previous final migration.
notify pgrst, 'reload schema';