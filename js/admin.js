import { supabase } from './supabase-client.js';

export async function getAllPlayers() {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updatePlayerProfile(userId, updates) {
  const allowed = ['full_name', 'birth_date', 'passport_number', 'username', 'status'];
  const safeUpdates = Object.fromEntries(Object.entries(updates || {}).filter(([key]) => allowed.includes(key)));
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
  const { error } = await supabase.rpc('issue_credit', { p_user_id: userId, p_amount: Number(amount), p_interest: Number(interest) });
  if (error) throw error;
}

export async function paySalary(userId, job, params = {}) {
  const { data, error } = await supabase.rpc('pay_salary_direct', { p_user_id: userId, p_job: job, p_params: params });
  if (error) throw error;
  return data;
}

export async function getUserFines(userId) {
  const { data, error } = await supabase.from('fines').select('*').eq('user_id', userId).eq('is_paid', false).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getUserCredits(userId) {
  const { data, error } = await supabase.from('credits').select('*').eq('user_id', userId).eq('is_closed', false).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getUserTransactions(userId) {
  const { data, error } = await supabase.from('transactions').select('*').or(`from_user.eq.${userId},to_user.eq.${userId}`).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return data || [];
}

export async function getAllFinesForUser(userId) {
  const { data, error } = await supabase.from('fines').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function deletePlayer(userId) {
  const { data, error } = await supabase.functions.invoke('delete-player', { body: { userId } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function createPlayer(email, password, username) {
  const { data, error } = await supabase.functions.invoke('create-player', { body: { email, password, username } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

// Bank-stability 3.0 operations UI. It intentionally does not write job/organization/position to profiles.
if (typeof document !== 'undefined') {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
  const money = v => Number(v || 0).toLocaleString('ru-RU') + ' ₽';
  let salaryPlayers = [];
  let selectedOperationPlayer = '';

  function activePlayers() {
    return salaryPlayers.filter(p => String(p.status || 'active').toLowerCase() === 'active');
  }

  function ensureOperationStyles() {
    if (document.getElementById('bankOpsExtraStyle')) return;
    const s = document.createElement('style'); s.id = 'bankOpsExtraStyle';
    s.textContent = `
      .bank-ops-picker{display:grid;grid-template-columns:minmax(260px,1fr) auto;gap:12px;align-items:end;margin-bottom:14px}
      .bank-ops-picker label{display:grid;gap:6px;color:#8fa2ba;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
      .bank-ops-picker select{width:100%;padding:12px 14px;border:1px solid #203752;background:#091727;border-radius:11px;color:#edf4ff;outline:none}
      .bank-ops-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
      .bank-ops-actions .action-card{min-height:105px}
      .bank-fine-cancel{margin-top:14px}
      .bank-fine-cancel select{width:100%;padding:11px 12px;border:1px solid #203752;background:#091727;border-radius:10px;color:#edf4ff}
      @media(max-width:760px){.bank-ops-picker{grid-template-columns:1fr}.bank-ops-actions{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(s);
  }

  async function loadOperationPlayers() {
    try { salaryPlayers = await getAllPlayers(); } catch (e) { console.error(e); return []; }
    return salaryPlayers;
  }

  function playerOptions(includeInactive = false) {
    const list = includeInactive ? salaryPlayers : activePlayers();
    return list.map(p => `<option value="${esc(p.id)}">${esc(p.full_name || p.username || 'Без имени')} · ${money(p.balance)}</option>`).join('');
  }

  function getPlayerId() {
    const select = document.getElementById('bankOperationPlayer');
    return select?.value || selectedOperationPlayer || '';
  }

  function addSalaryCard(actions) {
    if (document.getElementById('bankSalaryAction')) return;
    const b = document.createElement('button');
    b.type='button'; b.id='bankSalaryAction'; b.className='action-card';
    b.innerHTML='<i class="fa-solid fa-money-check-dollar"></i><span>Зарплата</span><small>Начислить зарплату игроку</small>';
    b.addEventListener('click', () => openSalaryModal(getPlayerId()));
    actions.appendChild(b);
  }

  function addCancelFineCard(actions) {
    if (document.getElementById('bankCancelFineAction')) return;
    const b = document.createElement('button');
    b.type='button'; b.id='bankCancelFineAction'; b.className='action-card danger';
    b.innerHTML='<i class="fa-solid fa-ban"></i><span>Отмена штрафа</span><small>Отменить активный штраф</small>';
    b.addEventListener('click', () => openCancelFineModal(getPlayerId()));
    actions.appendChild(b);
  }

  function buildOperationsUI() {
    const section = document.getElementById('section-operations');
    if (!section) return;
    ensureOperationStyles();
    const quick = section.querySelector('.quick-actions');
    if (!quick) return;
    quick.classList.add('bank-ops-actions');
    const oldPanel = section.querySelector('.operation-player-grid')?.closest('.panel');
    if (oldPanel) {
      oldPanel.innerHTML = `<div class="panel-head"><div><span class="eyebrow">Получатель</span><h3>Кому выполнить операцию</h3></div><span class="muted">Игрок выбирается один раз</span></div><div class="bank-ops-picker"><label>Игрок<select id="bankOperationPlayer"><option value="">Выберите игрока…</option></select></label><button type="button" class="secondary-btn" id="bankRefreshPlayers"><i class="fa-solid fa-rotate"></i> Обновить</button></div><div id="bankSelectedPlayerInfo" class="form-note">После выбора игрока все финансовые действия будут выполняться для него.</div>`;
      oldPanel.id='bankOperationPlayerPanel';
    }
    // Replace the old four cards with our complete operation set while keeping existing handlers on original cards.
    const existing = [...quick.querySelectorAll('[data-open-action]')];
    existing.forEach(b => b.classList.add('bank-operation-card'));
    addSalaryCard(quick); addCancelFineCard(quick);
    const select = document.getElementById('bankOperationPlayer');
    if (select) {
      select.innerHTML='<option value="">Выберите игрока…</option>'+playerOptions(false);
      select.value=selectedOperationPlayer;
      select.onchange=()=>{selectedOperationPlayer=select.value; updateSelectedInfo();};
    }
    document.getElementById('bankRefreshPlayers')?.addEventListener('click', async()=>{await loadOperationPlayers(); const s=document.getElementById('bankOperationPlayer'); if(s){s.innerHTML='<option value="">Выберите игрока…</option>'+playerOptions(false);s.value=selectedOperationPlayer;updateSelectedInfo();}});
    updateSelectedInfo();
  }

  function updateSelectedInfo(){
    const p=salaryPlayers.find(x=>x.id===getPlayerId()); const box=document.getElementById('bankSelectedPlayerInfo');
    if(!box)return;
    box.innerHTML=p?`Выбран: <strong>${esc(p.full_name||p.username||'Без имени')}</strong> · баланс <strong>${money(p.balance)}</strong>`:'После выбора игрока все финансовые действия будут выполняться для него.';
  }

  async function openSalaryModal(prefillId='') {
    if (!salaryPlayers.length) await loadOperationPlayers();
    const players=activePlayers();
    const modal=document.createElement('div'); modal.className='modal show';
    modal.innerHTML=`<div class="modal-card"><button class="modal-close" type="button">×</button><div class="modal-head"><span class="eyebrow">Финансовая операция</span><h2>Выдача зарплаты</h2><p>Работа выбирается только для начисления и не записывается в профиль игрока.</p></div><div class="form-grid"><label class="full">Игрок<select id="salaryPlayer">${playerOptions(false)}</select></label><label class="full">Работа<select id="salaryJob"><optgroup label="Обычные работы"><option value="mine">🦺 Шахта</option><option value="courier">🛵 Курьер</option><option value="mail">📪 Почта</option><option value="taxi">🚕 Такси</option><option value="bus">🚌 Автобус</option><option value="garbage">🚮 Мусоровоз</option><option value="delivery">🚚 Развозчик</option><option value="trucker">🚛 Дальнобойщик</option></optgroup><optgroup label="Государственные организации"><option value="ess">🚒 ЕСС</option><option value="mvd">🚓 МВД</option></optgroup></select></label><label id="salaryUnitsWrap">Заказы/клиенты<input id="salaryUnits" type="number" min="1" max="9" value="1"></label><label id="salaryContractWrap" style="display:none">Сумма контракта<input id="salaryContract" type="number" min="1" placeholder="Например, 5000"></label><label>Коэффициент<input id="salaryMultiplier" type="number" min="0.5" max="2" step="0.1" value="1"></label></div><div class="form-note" id="salaryPreview" style="margin-top:14px">Сумма будет окончательно рассчитана сервером.</div><button class="primary-btn wide" id="salarySubmit"><i class="fa-solid fa-money-check-dollar"></i> Выдать зарплату</button></div>`;
    document.body.appendChild(modal);
    const ps=modal.querySelector('#salaryPlayer'); if(prefillId && players.some(p=>p.id===prefillId))ps.value=prefillId;
    const job=modal.querySelector('#salaryJob'),units=modal.querySelector('#salaryUnits'),contract=modal.querySelector('#salaryContract'),mult=modal.querySelector('#salaryMultiplier'),preview=modal.querySelector('#salaryPreview');
    const fixed={mine:300,mail:1000,bus:1600,garbage:2700,delivery:1400,ess:1800,mvd:2200},per={courier:80,taxi:180},limits={courier:9,taxi:7};
    function refresh(){const k=job.value,variable=k in per,trucker=k==='trucker';modal.querySelector('#salaryUnitsWrap').style.display=variable?'grid':'none';modal.querySelector('#salaryContractWrap').style.display=trucker?'grid':'none';if(variable)units.value=Math.min(Math.max(1,Number(units.value||1)),limits[k]||1);const base=trucker?Number(contract.value||0):(variable?per[k]*Number(units.value||1):Number(fixed[k]||0));const m=Math.min(2,Math.max(.5,Number(mult.value||1)));preview.textContent=`Предварительно: ${money(base*m)}. Сервер повторно проверит правила и лимиты.`}
    [job,units,contract,mult].forEach(x=>x.addEventListener('input',refresh));job.addEventListener('change',refresh);refresh();
    modal.querySelector('.modal-close').onclick=()=>modal.remove(); modal.onclick=e=>{if(e.target===modal)modal.remove()};
    modal.querySelector('#salarySubmit').onclick=async()=>{const id=ps.value;if(!id)return alert('Выберите активного игрока');const params={orders:Number(units.value||1),contract_amount:Number(contract.value||0),multiplier:Number(mult.value||1)};try{const r=await paySalary(id,job.value,params);modal.remove();alert(`Зарплата начислена: ${money(r?.amount)}`);document.getElementById('refreshBtn')?.click()}catch(e){alert('Ошибка выдачи зарплаты: '+e.message)}};
  }

  async function openCancelFineModal(prefillId='') {
    if (!salaryPlayers.length) await loadOperationPlayers();
    const result=await supabase.from('fines').select('*').eq('is_paid',false).order('created_at',{ascending:false}).limit(300);
    if(result.error){alert('Не удалось загрузить штрафы: '+result.error.message);return;}
    const fines=result.data||[]; const available=fines.filter(f=>!prefillId||f.user_id===prefillId);
    const modal=document.createElement('div');modal.className='modal show';
    modal.innerHTML=`<div class="modal-card"><button class="modal-close" type="button">×</button><div class="modal-head"><span class="eyebrow">Штрафы</span><h2>Отмена штрафа</h2><p>Выберите активный штраф. Отмена выполняется через защищённый RPC.</p></div><label class="full">Штраф<select id="cancelFineSelect"><option value="">Выберите штраф…</option>${available.map(f=>`<option value="${esc(f.id)}">${esc(f.title||f.reason||'Штраф')} · ${money(f.amount)} · ${esc(f.user_id)}</option>`).join('')}</select></label><button class="danger-btn wide" id="cancelFineSubmit"><i class="fa-solid fa-ban"></i> Отменить штраф</button></div>`;
    document.body.appendChild(modal);modal.querySelector('.modal-close').onclick=()=>modal.remove();modal.onclick=e=>{if(e.target===modal)modal.remove()};
    modal.querySelector('#cancelFineSubmit').onclick=async()=>{const id=modal.querySelector('#cancelFineSelect').value;if(!id)return alert('Выберите штраф');if(!confirm('Отменить выбранный штраф?'))return;try{await cancelFine(id);modal.remove();alert('Штраф отменён');document.getElementById('refreshBtn')?.click()}catch(e){alert('Ошибка отмены штрафа: '+e.message)}};
  }

  async function bootBankOps(){
    if(!document.getElementById('section-operations')) return;
    await loadOperationPlayers();
    buildOperationsUI();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bootBankOps); else setTimeout(bootBankOps,50);
}
