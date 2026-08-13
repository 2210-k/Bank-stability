-- Final canonical salary RPC signature for PostgREST.
-- Keeps one explicit 7-argument function so named RPC calls cannot mismatch.

DROP FUNCTION IF EXISTS public.pay_salary_direct(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.pay_salary_direct(uuid, text, integer, text, numeric, text, jsonb);

CREATE OR REPLACE FUNCTION public.pay_salary_direct(
  p_contract_amount numeric DEFAULT 0,
  p_job text DEFAULT NULL,
  p_player_id uuid DEFAULT NULL,
  p_position text DEFAULT NULL,
  p_tuning jsonb DEFAULT '{}'::jsonb,
  p_units integer DEFAULT 0,
  p_vehicle_class text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job text := lower(trim(coalesce(p_job, '')));
  v_amount numeric := 0;
  v_position_salary numeric;
  v_multiplier numeric := 1;
  v_tuning jsonb := coalesce(p_tuning, '{}'::jsonb);
BEGIN
  IF NOT public.is_bank_admin() THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;

  IF v_job IN ('main','mine','mining') THEN v_job := 'mine'; END IF;

  IF p_player_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_player_id) THEN
    RAISE EXCEPTION 'Игрок не найден';
  END IF;

  IF v_job='mine' THEN v_amount:=300;
  ELSIF v_job='courier' THEN
    IF p_units<0 OR p_units>9 THEN RAISE EXCEPTION 'Курьер: максимум 9 заказов'; END IF;
    v_amount:=p_units*80;
  ELSIF v_job='mail' THEN v_amount:=1000;
  ELSIF v_job='taxi' THEN
    IF p_units<0 OR p_units>7 THEN RAISE EXCEPTION 'Такси: максимум 7 заказов'; END IF;
    v_amount:=p_units*180 + CASE lower(coalesce(p_vehicle_class,'low')) WHEN 'low' THEN 0 WHEN 'medium' THEN 300 WHEN 'high' THEN 600 WHEN 'business' THEN 1200 ELSE 0 END;
    IF coalesce((v_tuning->>'subwoofer')::boolean,false) THEN v_multiplier:=v_multiplier*1.2; END IF;
    IF coalesce((v_tuning->>'tint1')::boolean,false) THEN v_multiplier:=v_multiplier*1.3; END IF;
    IF coalesce((v_tuning->>'tint2')::boolean,false) THEN v_multiplier:=v_multiplier*1.4; END IF;
    v_amount:=round(v_amount*v_multiplier);
  ELSIF v_job='bus' THEN
    v_amount:=1600;
    IF coalesce((v_tuning->>'vip_interior')::boolean,false) THEN v_amount:=round(v_amount*1.3); END IF;
    IF coalesce((v_tuning->>'soundproof')::boolean,false) THEN v_amount:=round(v_amount*1.4); END IF;
    IF coalesce((v_tuning->>'climate_monitors')::boolean,false) THEN v_amount:=round(v_amount*1.5); END IF;
  ELSIF v_job='garbage' THEN v_amount:=2700;
  ELSIF v_job='delivery' THEN
    v_amount:=1400;
    IF coalesce((v_tuning->>'trunk')::boolean,false) THEN v_amount:=round(v_amount*1.2); END IF;
    IF coalesce((v_tuning->>'air_suspension')::boolean,false) THEN v_amount:=round(v_amount*1.5); END IF;
  ELSIF v_job='trucker' THEN
    IF coalesce(p_contract_amount,0)<0 THEN RAISE EXCEPTION 'Сумма контракта не может быть отрицательной'; END IF;
    v_amount:=coalesce(p_contract_amount,0);
  ELSIF v_job IN ('ess','mvd','army') THEN
    SELECT salary INTO v_position_salary FROM public.salary_positions WHERE job_key=v_job AND position_key=p_position;
    IF v_position_salary IS NULL THEN RAISE EXCEPTION 'Неизвестная должность: %', p_position; END IF;
    v_amount:=v_position_salary;
  ELSE
    RAISE EXCEPTION 'Неизвестная работа: %', p_job;
  END IF;

  UPDATE public.profiles SET balance=coalesce(balance,0)+v_amount WHERE id=p_player_id;

  IF to_regclass('public.salary_payments') IS NOT NULL THEN
    INSERT INTO public.salary_payments(player_id,job_key,position_key,amount,details,issued_by)
    VALUES(p_player_id,v_job,p_position,v_amount,jsonb_build_object('units',p_units,'contract_amount',p_contract_amount,'vehicle_class',p_vehicle_class,'tuning',v_tuning),auth.uid());
  END IF;

  RETURN jsonb_build_object('success',true,'amount',v_amount,'job',v_job,'position',p_position);
END;
$$;

REVOKE ALL ON FUNCTION public.pay_salary_direct(numeric,text,uuid,text,jsonb,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_salary_direct(numeric,text,uuid,text,jsonb,integer,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
