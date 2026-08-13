-- Compatibility fix for old admin UI sending p_job='main'.
-- New UI uses exact job keys (mine, courier, taxi, etc.).
-- The alias prevents a stale cached page from breaking salary issuance.

create or replace function public.pay_salary_direct(
  p_user_id uuid,
  p_job text,
  p_params jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.salary_rates%rowtype;
  p public.profiles%rowtype;
  v_job text := lower(btrim(coalesce(p_job,'')));
  v_units integer := greatest(1, coalesce((p_params->>'orders')::integer,1));
  v_amount numeric(14,2);
  v_contract numeric(14,2) := greatest(0,coalesce((p_params->>'contract_amount')::numeric,0));
  v_old numeric(14,2); v_new numeric(14,2); v_id bigint;
  v_class text := lower(coalesce(p_params->>'vehicle_class','low'));
  v_tuning text := lower(coalesce(p_params->>'tuning','none'));
  v_bonus numeric := 0; v_mult numeric := 1;
begin
  if not public.is_bank_admin() then
    raise exception 'Недостаточно прав: зарплату может выдавать только администратор';
  end if;

  -- Legacy UI compatibility: "main" used to mean the fixed Mine job.
  if v_job = 'main' then
    v_job := 'mine';
  end if;

  select * into r from public.salary_rates
  where job_key = v_job and enabled = true;
  if not found then raise exception 'Неизвестная работа: %',p_job; end if;

  select * into p from public.profiles where id=p_user_id for update;
  if not found then raise exception 'Игрок не найден'; end if;
  if coalesce(p.status,'active') <> 'active' then
    raise exception 'Нельзя выдать зарплату: аккаунт игрока имеет статус %',p.status;
  end if;

  if v_job='courier' then
    v_units := least(v_units,9);
    v_amount := v_units * 80;
  elsif v_job='taxi' then
    v_units := least(v_units,7);
    v_amount := v_units * 180;
    v_bonus := case v_class
      when 'low' then 0 when 'medium' then 300 when 'high' then 600 when 'business' then 1200 else 0 end;
    v_amount := v_amount + v_bonus;
    v_mult := case v_tuning
      when 'subwoofer' then 1.2 when 'tint1' then 1.3 when 'tint2' then 1.4 else 1 end;
    v_amount := round(v_amount*v_mult,2);
  elsif v_job='bus' then
    v_amount := 1600;
    v_mult := case v_tuning
      when 'vip_interior' then 1.3 when 'soundproof' then 1.4 when 'climate_monitors' then 1.5 else 1 end;
    v_amount := round(v_amount*v_mult,2);
  elsif v_job='delivery' then
    v_amount := 1400;
    v_mult := case v_tuning
      when 'trunk' then 1.2 when 'air_suspension' then 1.5 else 1 end;
    v_amount := round(v_amount*v_mult,2);
  elsif v_job='trucker' then
    v_amount := v_contract;
  else
    v_amount := r.base_amount;
  end if;

  if v_amount <= 0 then raise exception 'Сумма зарплаты должна быть больше нуля'; end if;

  v_old := coalesce(p.balance,0);
  v_new := v_old + v_amount;
  update public.profiles set balance=v_new where id=p_user_id;

  insert into public.salary_payments(player_id,admin_id,job_key,job_title,amount,units,params)
  values(p_user_id,auth.uid(),r.job_key,r.title,v_amount,v_units,p_params)
  returning id into v_id;

  insert into public.transactions(from_user,to_user,amount,type,description)
  values(auth.uid(),p_user_id,v_amount,'salary','Зарплата: '||r.title||' (#'||v_id||')');

  return jsonb_build_object(
    'payment_id',v_id,'player_id',p_user_id,'job',r.job_key,'title',r.title,
    'amount',v_amount,'units',v_units,'old_balance',v_old,'new_balance',v_new,
    'vehicle_bonus',v_bonus,'vehicle_multiplier',v_mult
  );
end;
$$;

revoke all on function public.pay_salary_direct(uuid,text,jsonb) from public;
grant execute on function public.pay_salary_direct(uuid,text,jsonb) to authenticated;
