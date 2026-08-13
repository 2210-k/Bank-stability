import { supabase } from './supabase-client.js';

export async function getAllPlayers() {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
export async function updatePlayerProfile(userId, updates) {
  const allowed = ['full_name', 'birth_date', 'passport_number', 'username', 'status'];
  const safeUpdates = Object.fromEntries(Object.entries(updates).filter(([key]) => allowed.includes(key)));
  const { error } = await supabase.from('profiles').update(safeUpdates).eq('id', userId);
  if (error) throw error;
}
export async function depositFunds(userId, amount, description = 'Пополнение админом') {
  const { error } = await supabase.rpc('admin_balance_operation', { p_amount: Math.abs(Number(amount)), p_description: description, p_player_id: userId });
  if (error) throw error;
}
export async function withdrawFunds(userId, amount, description = 'Снятие админом') {
  const { error } = await supabase.rpc('admin_balance_operation', { p_amount: -Math.abs(Number(amount)), p_description: description, p_player_id: userId });
  if (error) throw error;
}
export async function issueFine(userId, amount, reason, adminId) {
  const { error } = await supabase.rpc('admin_issue_penalty', { p_amount: Number(amount), p_player_id: userId, p_reason: reason, p_title: reason || 'Штраф' });
  if (error) throw error;
}
export async function cancelFine(fineId, adminId) {
  const { error } = await supabase.rpc('cancel_fine', { p_fine_id: fineId, p_admin_id: adminId });
  if (error) throw error;
}
export async function issueCredit(userId, amount, interest) {
  const { error } = await supabase.rpc('issue_credit', { p_user_id: userId, p_amount: amount, p_interest: interest });
  if (error) throw error;
}
export async function paySalary(userId, job, params = {}) {
  const { data, error } = await supabase.rpc('pay_salary_direct', { p_user_id: userId, p_job: job, p_params: params });
  if (error) throw error;
  return data;
}
export async function getUserFines(userId) {
  const { data, error } = await supabase.from('fines').select('*').eq('user_id', userId).eq('is_paid', false);
  if (error) throw error;
  return data;
}
export async function getUserCredits(userId) {
  const { data, error } = await supabase.from('credits').select('*').eq('user_id', userId).eq('is_closed', false);
  if (error) throw error;
  return data;
}
export async function getUserTransactions(userId) {
  const { data, error } = await supabase.from('transactions').select('*').or(`from_user.eq.${userId},to_user.eq.${userId}`).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return data;
}
export async function getAllFinesForUser(userId) {
  const { data, error } = await supabase.from('fines').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
export async function deletePlayer(userId) {
  const { data, error } = await supabase.functions.invoke('delete-player', { body: { userId } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}
export async function createPlayer(email, password, username) {
  const { data, error } = await supabase.functions.invoke('create-player', { body: { email, password, username } });
  if (error) {
    if (error.message?.includes('function not found')) throw new Error('Edge Function "create-player" не развёрнута.');
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/* Зарплата — отдельная операция. Работа никогда не записывается в profiles. */
if (typeof document !== 'undefined') queueMicrotask(() => {
  const quick = document.querySelector('#section-operations .quick-actions');
  if (!quick || document.getElementById('salaryActionCard')) return;
  const card = document.createElement('button');
  card.id = 'salaryActionCard'; card.className = 'action-card';
  card.innerHTML = '<i class="fa-solid fa-money-check-dollar"></i><span>Зарплата</span><small>Выдать зарплату игроку</small>';
  quick.appendChild(card);
  card.onclick = openSalaryModal;

  async function openSalaryModal() {
    let players;
    try { players = await getAllPlayers(); } catch (e) { alert('Не удалось загрузить игроков: ' + e.message); return; }
    const modal = document.createElement('div'); modal.className = 'modal show';
    modal.innerHTML = `<div class="modal-card"><button class="modal-close" type="button">×</button><div class="modal-head"><span class="eyebrow">Финансовая операция</span><h2>Выдача зарплаты</h2><p>Работа выбирается для начисления и не сохраняется в банковском профиле.</p></div><div class="form-grid"><label class="full">Игрок<select id="salaryPlayer"></select></label><label class="full">Работа<select id="salaryJob"><optgroup label="Обычные работы"><option value="mine">🦺 Шахта</option><option value="courier">🛵 Курьер</option><option value="mail">📪 Почта</option><option value="taxi">🚕 Такси</option><option value="bus">🚌 Автобус</option><option value="garbage">🚮 Мусоровоз</option><option value="delivery">🚚 Развозчик</option><option value="trucker">🚛 Дальнобойщик</option></optgroup><optgroup label="Государственные организации"><option value="ess">🚒 ЕСС</option><option value="mvd">🚓 МВД</option></optgroup></select></label><label id="salaryUnitsWrap">Заказы/клиенты<input id="salaryUnits" type="number" min="1" value="1"></label><label id="salaryContractWrap" style="display:none">Сумма контракта<input id="salaryContract" type="number" min="1" placeholder="Например, 5000"></label><label>Коэффициент<input id="salaryMultiplier" type="number" min="0.5" max="2" step="0.1" value="1"></label></div><div class="form-note" id="salaryPreview" style="margin-top:14px">Сумма будет окончательно рассчитана сервером.</div><button class="primary-btn wide" id="salarySubmit"><i class="fa-solid fa-money-check-dollar"></i> Выдать зарплату</button></div>`;
    document.body.appendChild(modal);
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
    const ps = modal.querySelector('#salaryPlayer');
    ps.innerHTML = players.filter(p => (p.status || 'active') === 'active').map(p => `<option value="${p.id}">${esc(p.full_name || p.username || 'Без имени')} · ${Number(p.balance || 0).toLocaleString('ru-RU')} ₽</option>`).join('') || '<option value="">Нет активных игроков</option>';
    const job = modal.querySelector('#salaryJob'), units = modal.querySelector('#salaryUnits'), contract = modal.querySelector('#salaryContract'), mult = modal.querySelector('#salaryMultiplier'), preview = modal.querySelector('#salaryPreview');
    const fixed = { mine:300, mail:1000, bus:1600, garbage:2700, delivery:1400, ess:1800, mvd:2200 }, per = { courier:80, taxi:180 }, limits = { courier:9, taxi:7 };
    function refresh() { const k=job.value, variable=k in per, trucker=k==='trucker'; modal.querySelector('#salaryUnitsWrap').style.display=variable?'block':'none'; modal.querySelector('#salaryContractWrap').style.display=trucker?'block':'none'; units.value=Math.min(Math.max(1,Number(units.value||1)),limits[k]||1); const base=trucker?Number(contract.value||0):(variable?per[k]*Number(units.value):Number(fixed[k]||0)); const m=Math.min(2,Math.max(.5,Number(mult.value||1))); preview.textContent=`Предварительно: ${(base*m).toLocaleString('ru-RU')} ₽. Сервер повторно проверит лимиты и статус игрока.`; }
    [job,units,contract,mult].forEach(x=>x.addEventListener('input',refresh)); job.addEventListener('change',refresh); refresh();
    modal.querySelector('.modal-close').onclick=()=>modal.remove(); modal.onclick=e=>{if(e.target===modal)modal.remove()};
    modal.querySelector('#salarySubmit').onclick=async()=>{const id=ps.value;if(!id)return alert('Нет активного игрока');const params={orders:Number(units.value||1),contract_amount:Number(contract.value||0),multiplier:Number(mult.value||1)};try{const r=await paySalary(id,job.value,params);modal.remove();const box=document.getElementById('alertsContainer');if(box){box.innerHTML=`<div class="alert alert-success">Зарплата ${Number(r.amount).toLocaleString('ru-RU')} ₽ начислена. Платёж #${r.payment_id}</div>`;setTimeout(()=>box.innerHTML='',4000)}}catch(e){alert('Ошибка выдачи зарплаты: '+e.message)}};
  }
});
