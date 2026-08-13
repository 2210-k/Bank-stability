-- BANK-STABILITY 3.0 RUNTIME HOTFIX
-- This migration fixes the RPC 404s reported by the web client.
-- Run this ONCE in Supabase SQL Editor, then reload the schema.

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
  v_old numeric;
  v_new numeric;
  v_amount numeric := coalesce(p_amount,0);
  v_status text;
begin
  if not public.is_bank_admin() then raise exception 'Недостаточно прав'; end if;
  if v_amount = 0 then raise exception 'Сумма не может быть нулевой'; end if;

  select coalesce(balance,0), lower(coalesce(status,'active'))
    into v_old, v_status
  from public.profiles
  where id = p_player_id
  for update;

  if not found then raise exception 'Игрок не найден'; end if;
  if v_status <> 'active' then raise exception 'Игрок заморожен или заблокирован'; end if;

  v_new := v_old + v_amount;
  if v_new < 0 then raise exception 'Недостаточно средств у игрока'; end if;

  update public.profiles set balance = v_new where id = p_player_id;

  insert into public.transactions(from_user,to_user,amount,type,description)
  values(
    case when v_amount < 0 then p_player_id else auth.uid() end,
    case when v_amount > 0 then p_player_id else auth.uid() end,
    abs(v_amount),
    case when v_amount > 0 then 'deposit' else 'withdraw' end,
    coalesce(nullif(trim(p_description),''),case when v_amount > 0 then 'Пополнение администратором' else 'Снятие администратором' end)
  );

  return jsonb_build_object('success',true,'amount',v_amount,'old_balance',v_old,'new_balance',v_new);
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

  update public.profiles
  set full_name = coalesce(nullif(trim(p_full_name),''), full_name),
      birth_date = p_birth_date,
      passport_number = nullif(trim(p_passport_number),''),
      username = coalesce(nullif(trim(p_username),''), username)
  where id = p_player_id;

  if not found then raise exception 'Игрок не найден'; end if;
  return jsonb_build_object('success',true,'player_id',p_player_id);
end;
$$;
revoke all on function public.admin_update_player_profile(uuid,text,date,text,text) from public;
grant execute on function public.admin_update_player_profile(uuid,text,date,text,text) to authenticated;

create or replace function public.bank_create_notification(
  p_user_id uuid,
  p_title text,
  p_message text,
  p_kind text default 'info'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id bigint;
begin
  if not public.is_bank_admin() then raise exception 'Недостаточно прав'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'Игрок не найден'; end if;

  insert into public.bank_notifications(user_id,title,message,kind)
  values(
    p_user_id,
    coalesce(nullif(trim(p_title),''),'Уведомление'),
    coalesce(nullif(trim(p_message),''),'Без текста'),
    coalesce(nullif(trim(p_kind),''),'info')
  )
  returning id into v_id;

  return jsonb_build_object('success',true,'id',v_id);
end;
$$;
revoke all on function public.bank_create_notification(uuid,text,text,text) from public;
grant execute on function public.bank_create_notification(uuid,text,text,text) to authenticated;

create or replace function public.admin_delete_transaction(p_transaction_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_bank_admin() then raise exception 'Недостаточно прав'; end if;
  delete from public.transactions where id::text = p_transaction_id;
  if not found then raise exception 'Операция не найдена'; end if;
  return jsonb_build_object('success',true,'deleted_id',p_transaction_id);
end;
$$;
revoke all on function public.admin_delete_transaction(text) from public;
grant execute on function public.admin_delete_transaction(text) to authenticated;

create or replace function public.admin_clear_player_history(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if not public.is_bank_admin() then raise exception 'Недостаточно прав'; end if;
  delete from public.transactions where from_user=p_player_id or to_user=p_player_id;
  get diagnostics v_count = row_count;
  return jsonb_build_object('success',true,'deleted_count',v_count);
end;
$$;
revoke all on function public.admin_clear_player_history(uuid) from public;
grant execute on function public.admin_clear_player_history(uuid) to authenticated;

create or replace function public.admin_mark_notification_read(p_notification_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bank_notifications
  set is_read=true
  where id=p_notification_id and user_id=auth.uid();
  return jsonb_build_object('success',true);
end;
$$;
grant execute on function public.admin_mark_notification_read(bigint) to authenticated;

-- Make sure the notification table exists even if the previous feature migration was skipped.
create table if not exists public.bank_notifications (
  id bigint generated by default as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  kind text not null default 'info',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists bank_notifications_user_idx on public.bank_notifications(user_id,created_at desc);
alter table public.bank_notifications enable row level security;
drop policy if exists "players read own bank notifications" on public.bank_notifications;
create policy "players read own bank notifications" on public.bank_notifications for select to authenticated using (user_id=auth.uid());

notify pgrst,'reload schema';
