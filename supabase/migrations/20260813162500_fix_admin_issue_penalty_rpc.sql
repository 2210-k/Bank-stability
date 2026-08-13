-- Fix: the frontend calls admin_issue_penalty, but older Supabase projects may not have applied the Bank-stability 3.0 schema migration.
-- Safe to run repeatedly.

create or replace function public.admin_issue_penalty(
  p_amount numeric,
  p_player_id uuid,
  p_reason text,
  p_title text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_bank_admin() then
    raise exception 'Недостаточно прав';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Сумма штрафа должна быть положительной';
  end if;

  if not public.can_use_bank_account(p_player_id) then
    raise exception 'Счёт игрока заморожен или заблокирован';
  end if;

  if not exists (select 1 from public.profiles where id = p_player_id) then
    raise exception 'Игрок не найден';
  end if;

  insert into public.fines (user_id, amount, reason, is_paid)
  values (
    p_player_id,
    p_amount,
    coalesce(nullif(btrim(p_reason), ''), nullif(btrim(p_title), ''), 'Штраф'),
    false
  )
  returning id into v_id;

  return jsonb_build_object(
    'success', true,
    'id', v_id,
    'player_id', p_player_id,
    'amount', p_amount
  );
end;
$$;

revoke all on function public.admin_issue_penalty(numeric, uuid, text, text) from public;
grant execute on function public.admin_issue_penalty(numeric, uuid, text, text) to authenticated;
