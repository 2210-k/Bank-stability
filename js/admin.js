// Bank-stability 3.0 admin API — one canonical server contract.
if (typeof globalThis !== 'undefined') {
  globalThis.closeModal = function () {
    const modal = document.getElementById('modal');
    if (modal) modal.classList.remove('open');
  };
}

import { supabase } from './supabase-client.js';

function rpcError(error) {
  if (!error) return null;
  return new Error(error.message || error.details || error.hint || 'Ошибка серверной операции');
}

async function callRpc(name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw rpcError(error);
  return data;
}

export async function getAllPlayers() {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updatePlayerProfile(id, updates) {
  const allowed = ['full_name', 'birth_date', 'passport_number', 'username', 'status'];
  const safe = Object.fromEntries(Object.entries(updates || {}).filter(([k]) => allowed.includes(k)));
  const { error } = await supabase.from('profiles').update(safe).eq('id', id);
  if (error) throw error;
}

export async function setPlayerStatus(id, status) {
  return callRpc('admin_set_player_status', { p_player_id: id, p_status: status });
}

export async function depositFunds(id, amount, description = 'Пополнение админом') {
  const value = Math.abs(Number(amount));
  if (!Number.isFinite(value) || value <= 0) throw new Error('Введите корректную сумму');
  return callRpc('admin_balance_operation', { p_amount: value, p_description: description, p_player_id: id });
}

export async function withdrawFunds(id, amount, description = 'Снятие админом') {
  const value = Math.abs(Number(amount));
  if (!Number.isFinite(value) || value <= 0) throw new Error('Введите корректную сумму');
  return callRpc('admin_balance_operation', { p_amount: -value, p_description: description, p_player_id: id });
}

export async function issueFine(id, amount, reason) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error('Введите корректную сумму штрафа');
  return callRpc('admin_issue_penalty', { p_amount: value, p_player_id: id, p_reason: reason || 'Штраф', p_title: reason || 'Штраф' });
}

export async function cancelFine(id) {
  const { data: { user } } = await supabase.auth.getUser();
  return callRpc('cancel_fine', { p_fine_id: id, p_admin_id: user?.id || null });
}

export async function issueCredit(id, amount, interest = 0) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error('Введите корректную сумму кредита');
  return callRpc('issue_credit', { p_user_id: id, p_amount: value, p_interest: Number(interest) || 0 });
}

export async function paySalary(id, job, params = {}) {
  const positionMap = {
    ess_driver: ['ess', 'driver'], ess_firefighter: ['ess', 'firefighter'], ess_rescuer: ['ess', 'rescuer'], ess_inspector: ['ess', 'inspector'], ess_paramedic: ['ess', 'paramedic'], ess_doctor: ['ess', 'doctor'], ess_narcologist: ['ess', 'narcologist'], ess_surgeon: ['ess', 'surgeon'],
    mvd_private: ['mvd', 'private'], mvd_junior_sergeant: ['mvd', 'junior_sergeant'], mvd_sergeant: ['mvd', 'sergeant'], mvd_master_sergeant: ['mvd', 'foreman'], mvd_warrant: ['mvd', 'warrant_officer'], mvd_junior_lieutenant: ['mvd', 'junior_lieutenant'], mvd_lieutenant: ['mvd', 'lieutenant'], mvd_captain: ['mvd', 'captain'], mvd_major: ['mvd', 'major'], mvd_lieutenant_colonel: ['mvd', 'lieutenant_colonel'],
    mil_private: ['army', 'private'], mil_corporal: ['army', 'corporal'], mil_junior_sergeant: ['army', 'junior_sergeant'], mil_sergeant: ['army', 'sergeant'], mil_senior_sergeant: ['army', 'senior_sergeant'], mil_master_sergeant: ['army', 'foreman'], mil_warrant: ['army', 'warrant'], mil_junior_lieutenant: ['army', 'junior_lieutenant'], mil_lieutenant: ['army', 'lieutenant']
  };

  let p_job = job === 'main' ? 'mine' : job;
  let p_position = null;
  if (positionMap[job]) [p_job, p_position] = positionMap[job];

  const tuning = params.tuning || 'none';
  const p_tuning = {
    subwoofer: tuning === 'subwoofer', tint1: tuning === 'tint1', tint2: tuning === 'tint2',
    vip_interior: tuning === 'vip_interior', soundproof: tuning === 'soundproof', climate_monitors: tuning === 'climate_monitors',
    trunk: tuning === 'trunk', air_suspension: tuning === 'air_suspension'
  };

  return callRpc('pay_salary_direct', {
    p_contract_amount: Number(params.contract_amount || 0),
    p_job,
    p_player_id: id,
    p_position,
    p_tuning,
    p_units: Number(params.orders || 0),
    p_vehicle_class: params.vehicle_class || null
  });
}

export async function getUserFines(id) {
  const { data, error } = await supabase.from('fines').select('*').eq('user_id', id).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getUserCredits(id) {
  const { data, error } = await supabase.from('credits').select('*').eq('user_id', id).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getTransactions() {
  const { data, error } = await supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return data || [];
}

export const SALARY_JOBS = {
  mine:['Обычные работы','🦺 Шахта','fixed',300], courier:['Обычные работы','🛵 Курьер','orders',80,9], mail:['Обычные работы','📪 Почта','fixed',1000], taxi:['Обычные работы','🚕 Такси','taxi',180,7], bus:['Обычные работы','🚌 Автобус','bus',1600], garbage:['Обычные работы','🚮 Мусоровоз','fixed',2700], delivery:['Обычные работы','🚚 Развозчик','delivery',1400], trucker:['Обычные работы','🚛 Дальнобойщик','contract',0],
  ess_driver:['ЕСС','🚒 Водитель','fixed',1500], ess_firefighter:['ЕСС','🚒 Пожарный','fixed',1800], ess_rescuer:['ЕСС','🚒 Спасатель','fixed',2200], ess_inspector:['ЕСС','🚒 Инспектор','fixed',2500], ess_paramedic:['ЕСС','🚒 Фельдшер','fixed',2800], ess_doctor:['ЕСС','🚒 Врач','fixed',3200], ess_narcologist:['ЕСС','🚒 Нарколог','fixed',3600], ess_surgeon:['ЕСС','🚒 Хирург','fixed',4000],
  mvd_private:['МВД','🚓 Рядовой','fixed',1500], mvd_junior_sergeant:['МВД','🚓 Мл. сержант','fixed',1800], mvd_sergeant:['МВД','🚓 Сержант','fixed',2100], mvd_master_sergeant:['МВД','🚓 Старшина','fixed',2400], mvd_warrant:['МВД','🚓 Прапорщик','fixed',2700], mvd_junior_lieutenant:['МВД','🚓 Мл. лейтенант','fixed',3000], mvd_lieutenant:['МВД','🚓 Лейтенант','fixed',3300], mvd_captain:['МВД','🚓 Капитан','fixed',3600], mvd_major:['МВД','🚓 Майор','fixed',3900], mvd_lieutenant_colonel:['МВД','🚓 Подполковник','fixed',4200],
  mil_private:['Воинская часть','🪖 Рядовой','fixed',500], mil_corporal:['Воинская часть','🪖 Ефрейтор','fixed',800], mil_junior_sergeant:['Воинская часть','🪖 Мл. сержант','fixed',1100], mil_sergeant:['Воинская часть','🪖 Сержант','fixed',2000], mil_senior_sergeant:['Воинская часть','🪖 Ст. сержант','fixed',2300], mil_master_sergeant:['Воинская часть','🪖 Старшина','fixed',2600], mil_warrant:['Воинская часть','🪖 Прапорщик','fixed',2900], mil_junior_lieutenant:['Воинская часть','🪖 Мл. лейтенант','fixed',3200], mil_lieutenant:['Воинская часть','🪖 Лейтенант','fixed',3500]
};

export function calculateSalary(job, p = {}) {
  const j = SALARY_JOBS[job]; if (!j) return 0;
  const type = j[2];
  if (type === 'fixed') return j[3];
  if (type === 'orders') return Math.min(j[4], Math.max(0, Number(p.orders || 0))) * j[3];
  if (type === 'contract') return Math.max(0, Number(p.contract_amount || 0));
  if (type === 'taxi') {
    const n = Math.min(7, Math.max(0, Number(p.orders || 0)));
    const cls = { low:0, medium:300, high:600, business:1200 }[p.vehicle_class] ?? 0;
    let amount = n * 180 + cls;
    if (p.tuning === 'subwoofer') amount *= 1.2;
    if (p.tuning === 'tint1') amount *= 1.3;
    if (p.tuning === 'tint2') amount *= 1.4;
    return Math.round(amount);
  }
  if (type === 'bus') return Math.round(1600 * ({none:1,vip_interior:1.3,soundproof:1.4,climate_monitors:1.5}[p.tuning] ?? 1));
  if (type === 'delivery') return Math.round(1400 * ({none:1,trunk:1.2,air_suspension:1.5}[p.tuning] ?? 1));
  return 0;
}
