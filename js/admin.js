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
  const { error } = await supabase.rpc('admin_balance_operation', {
    p_amount: Math.abs(Number(amount)), p_description: description, p_player_id: userId
  });
  if (error) throw error;
}

export async function withdrawFunds(userId, amount, description = 'Снятие админом') {
  const { error } = await supabase.rpc('admin_balance_operation', {
    p_amount: -Math.abs(Number(amount)), p_description: description, p_player_id: userId
  });
  if (error) throw error;
}

export async function issueFine(userId, amount, reason, adminId) {
  const { error } = await supabase.rpc('admin_issue_penalty', {
    p_amount: Number(amount), p_player_id: userId, p_reason: reason, p_title: reason || 'Штраф'
  });
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
  const { data, error } = await supabase.rpc('pay_salary_direct', {
    p_user_id: userId, p_job: job, p_params: params
  });
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

/* Зарплата: отдельный UI-модуль. Работа намеренно НЕ записывается в profiles. */
if (typeof document !== 'undefined') {
  queueMicrotask(() => {
    const quick = document.querySelector('#section-operations .quick-actions');
    if (!quick || document.getElementById('salaryActionCard')) return;

    const card = document.createElement('button');
    card.id = 'salaryActionCard';
    card.className = 'action-card';
    card.innerHTML = '<i class="fa-solid fa-money-check-dollar"></i><span>Зарплата</span><small>Выдать зарплату игроку</small>';
    quick.appendChild(card);

    card.addEventListener('click', openSalaryModal);

    async function openSalaryModal() {
      const players = await getAllPlayers();
      const modal = document.createElement('div');
      modal.className = 'modal show';
      modal.innerHTML = `
        <div class="modal-card">
          <button class="modal-close" type="button">×</button>
          <div class="modal-head">
            <span class="eyebrow">Финансовая операция</span>
            <h2>Выдача зарплаты</h2>
            <p>Работа берётся из выбранной операции и НЕ сохраняется в банковском профиле.</p>
          </div>
          <div class="form-grid">
            <label class="full">Игрок<select id="salaryPlayer"></select></label>
            <label class="full">Работа<select id="salaryJob">
              <optgroup label="Обычные работы">
                <option value="mine">🦺 Шахта</option>
                <option value="courier">🛵 Курьер</option>
                <option value="mail">📪 Почта</option>
                <option value="taxi">🚕 Такси</option>
                <option value="bus">🚌 Автобус</option>
                <option value="garbage">🚮 Мусоровоз</option>
                <option value="delivery">🚚 Развозчик</option>
                <option value="trucker">🚛 Дальнобойщик</option>
              </optgroup>
              <optgroup label="Государственные организации">
                <option value="ess">🚒 ЕСС</option>
                <option value="mvd">🚓 МВД</option>
              </optgroup>
            </select></label>
            <label id="salaryUnitsWrap">Количество заказов/клиентов<input id="salaryUnits" type="number" min="1" value="1"></label>
            <label id="salaryMultiplierWrap">Коэффициент<input id="salaryMultiplier" type="number" min="0.5" max="2" step="0.1" value="1"></label>
          </div>
          <div class="form-note" id="salaryPreview" style="margin-top:14px">Выберите работу — сумма будет рассчитана сервером.</div>
          <button class="primary-btn wide" id="salarySubmit"><i class="fa-solid fa-money-check-dollar"></i> Выдать зарплату</button>
        </div>`;
      document.body.appendChild(modal);

      const playerSelect = modal.querySelector('#salaryPlayer');
      playerSelect.innerHTML = players.filter(p => (p.status || 'active') === 'active').map(p => `<option value="${p.id}">${escapeHtml(p.full_name || p.username || 'Без имени')} · ${Number(p.balance || 0).toLocaleString('ru-RU')} ₽</option>`).join('');
      if (!playerSelect.options.length) playerSelect.innerHTML = '<option value="">Нет активных игроков</option>';

      const job = modal.querySelector('#salaryJob');
      const units = modal.querySelector('#salaryUnits');
      const preview = modal.querySelector('#salaryPreview');
      const limits = { courier:9, mail:9, taxi:7 };
      const fixed = { mine:500, bus:650, garbage:750, delivery:900, trucker:1200, ess:1800, mvd:2200 };
      const per = { courier:80, mail:110, taxi:180 };

      function refreshSalaryFields() {
        const key = job.value;
        const variable = key in per;
        modal.querySelector('#salaryUnitsWrap').style.display = variable ? 'block' : 'none';
        const n = Math.min(Math.max(1, Number(units.value || 1)), limits[key] || 1);
        units.value = n;
        const base = variable ? per[key] * n : (fixed[key] || 0);
        const multiplier = Math.min(2, Math.max(.5, Number(modal.querySelector('#salaryMultiplier').value || 1)));
        preview.textContent = `Предварительно: ${(base * multiplier).toLocaleString('ru-RU')} ₽. Окончательная сумма рассчитывается и проверяется сервером.`;
      }
      job.addEventListener('change', refreshSalaryFields);
      units.addEventListener('input', refreshSalaryFields);
      modal.querySelector('#salaryMultiplier').addEventListener('input', refreshSalaryFields);
      refreshSalaryFields();

      modal.querySelector('.modal-close').onclick = () => modal.remove();
      modal.onclick = e => { if (e.target === modal) modal.remove(); };
      modal.querySelector('#salarySubmit').onclick = async () => {
        const playerId = playerSelect.value;
        if (!playerId) return alert('Нет активного игрока');
        try {
          const result = await paySalary(playerId, job.value, {
            orders: Number(units.value || 1),
            multiplier: Number(modal.querySelector('#salaryMultiplier').value || 1)
          });
          modal.remove();
          if (typeof window.showAlert === 'function') window.showAlert(`Зарплата ${Number(result.amount).toLocaleString('ru-RU')} ₽ начислена`, 'success');
          else alert(`Зарплата ${Number(result.amount).toLocaleString('ru-RU')} ₽ начислена`);
        } catch (e) {
          alert('Ошибка выдачи зарплаты: ' + e.message);
        }
      };
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
    }
  });
}
