import { supabase } from './supabase-client.js';

export async function getAllPlayers() {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
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
  return data || [];
}

export async function getUserCredits(userId) {
  const { data, error } = await supabase.from('credits').select('*').eq('user_id', userId).eq('is_closed', false);
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
  if (error) {
    if (error.message?.includes('function not found')) throw new Error('Edge Function "create-player" не развёрнута.');
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/*
 * Зарплата — отдельная банковская операция.
 * Работа никогда не записывается в profiles.
 * UI создаётся после загрузки DOM, поэтому кнопка гарантированно появляется.
 */
if (typeof document !== 'undefined') {
  setTimeout(() => {
    const quick = document.querySelector('#section-operations .quick-actions');
    if (!quick || document.getElementById('salaryActionCard')) return;

    // Зарплата — первая карточка, чтобы её невозможно было потерять среди операций.
    const card = document.createElement('button');
    card.id = 'salaryActionCard';
    card.type = 'button';
    card.className = 'action-card';
    card.innerHTML = '<i class="fa-solid fa-money-check-dollar"></i><span>Зарплата</span><small>Выдать зарплату игроку</small>';
    quick.prepend(card);
    card.addEventListener('click', openSalaryModal);

    // Удобный выбор игрока для ВСЕХ операций.
    // Вместо длинной сетки игроков появляется поиск + компактный select.
    const panel = document.querySelector('#section-operations .panel');
    const grid = document.getElementById('operationPlayers');
    if (panel && grid && !document.getElementById('operationPlayerPicker')) {
      const picker = document.createElement('div');
      picker.id = 'operationPlayerPicker';
      picker.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:end;margin-bottom:16px';
      picker.innerHTML = `
        <label style="display:block;min-width:0">
          <span class="eyebrow" style="display:block;margin-bottom:7px">Получатель операции</span>
          <select id="operationPlayerSelect" style="width:100%;padding:12px;border:1px solid #203752;background:#091727;border-radius:10px;color:#edf4ff">
            <option value="">Выберите игрока…</option>
          </select>
        </label>
        <button type="button" id="operationOpenPlayer" class="secondary-btn"><i class="fa-solid fa-user"></i> Профиль</button>`;
      panel.insertBefore(picker, panel.firstChild);

      const select = picker.querySelector('#operationPlayerSelect');
      const profileBtn = picker.querySelector('#operationOpenPlayer');

      function refreshPicker() {
        const rows = [...grid.querySelectorAll('.operation-player')];
        select.innerHTML = '<option value="">Выберите игрока…</option>';
        rows.forEach(row => {
          const id = row.dataset.playerId || row.dataset.id || row.getAttribute('data-user-id');
          if (!id) return;
          const name = row.querySelector('strong')?.textContent?.trim() || row.textContent.trim();
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = name;
          select.appendChild(opt);
        });
      }

      function clickOperationPlayer(id) {
        if (!id) return false;
        const row = [...grid.querySelectorAll('.operation-player')].find(x =>
          (x.dataset.playerId || x.dataset.id || x.getAttribute('data-user-id')) === id
        );
        if (row) { row.click(); return true; }
        return false;
      }

      select.addEventListener('change', () => {
        if (select.value) clickOperationPlayer(select.value);
      });
      profileBtn.addEventListener('click', () => {
        if (!select.value) return alert('Сначала выберите игрока');
        clickOperationPlayer(select.value);
      });

      // renderOperationPlayers() вызывается после loadAll(), поэтому следим за обновлением grid.
      new MutationObserver(refreshPicker).observe(grid, { childList: true, subtree: true });
      refreshPicker();
    }

    // Если администратор пытается сделать операцию без игрока — сначала выбор игрока.
    document.querySelectorAll('#section-operations .quick-actions .action-card:not(#salaryActionCard)').forEach(btn => {
      btn.addEventListener('click', () => {
        const select = document.getElementById('operationPlayerSelect');
        if (select && !select.value) {
          alert('Сначала выберите игрока в поле «Получатель операции».');
          select.focus();
        }
      }, true);
    });

    async function openSalaryModal() {
      let players;
      try { players = await getAllPlayers(); }
      catch (e) { alert('Не удалось загрузить игроков: ' + e.message); return; }

      const modal = document.createElement('div');
      modal.className = 'modal show';
      modal.innerHTML = `
        <div class="modal-card">
          <button class="modal-close" type="button">×</button>
          <div class="modal-head">
            <span class="eyebrow">Финансовая операция</span>
            <h2>Выдача зарплаты</h2>
            <p>Работа выбирается только для начисления и не сохраняется в банковском профиле.</p>
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
            <label id="salaryUnitsWrap">Заказы / клиенты<input id="salaryUnits" type="number" min="1" value="1"></label>
            <label id="salaryContractWrap" style="display:none">Сумма контракта<input id="salaryContract" type="number" min="1" placeholder="Например, 5000"></label>
            <label>Коэффициент<input id="salaryMultiplier" type="number" min="0.5" max="2" step="0.1" value="1"></label>
          </div>
          <div class="form-note" id="salaryPreview" style="margin-top:14px">Сумма будет окончательно рассчитана сервером.</div>
          <button class="primary-btn wide" id="salarySubmit"><i class="fa-solid fa-money-check-dollar"></i> Выдать зарплату</button>
        </div>`;
      document.body.appendChild(modal);

      const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
      const ps = modal.querySelector('#salaryPlayer');
      ps.innerHTML = players.filter(p => (p.status || 'active') === 'active').map(p => `<option value="${esc(p.id)}">${esc(p.full_name || p.username || 'Без имени')} · ${Number(p.balance || 0).toLocaleString('ru-RU')} ₽</option>`).join('') || '<option value="">Нет активных игроков</option>';

      const job = modal.querySelector('#salaryJob');
      const units = modal.querySelector('#salaryUnits');
      const contract = modal.querySelector('#salaryContract');
      const mult = modal.querySelector('#salaryMultiplier');
      const preview = modal.querySelector('#salaryPreview');
      const fixed = { mine:300, mail:1000, bus:1600, garbage:2700, delivery:1400, ess:1800, mvd:2200 };
      const per = { courier:80, taxi:180 };
      const limits = { courier:9, taxi:7 };

      function refresh() {
        const k = job.value;
        const variable = k in per;
        const trucker = k === 'trucker';
        modal.querySelector('#salaryUnitsWrap').style.display = variable ? 'block' : 'none';
        modal.querySelector('#salaryContractWrap').style.display = trucker ? 'block' : 'none';
        units.value = Math.min(Math.max(1, Number(units.value || 1)), limits[k] || 1);
        const base = trucker ? Number(contract.value || 0) : (variable ? per[k] * Number(units.value) : Number(fixed[k] || 0));
        const m = Math.min(2, Math.max(.5, Number(mult.value || 1)));
        preview.textContent = `Предварительно: ${(base * m).toLocaleString('ru-RU')} ₽. Сервер повторно проверит лимиты, сумму и статус игрока.`;
      }

      [job, units, contract, mult].forEach(x => x.addEventListener('input', refresh));
      job.addEventListener('change', refresh);
      refresh();
      modal.querySelector('.modal-close').onclick = () => modal.remove();
      modal.onclick = e => { if (e.target === modal) modal.remove(); };

      modal.querySelector('#salarySubmit').onclick = async () => {
        const id = ps.value;
        if (!id) return alert('Нет активного игрока');
        const params = {
          orders: Number(units.value || 1),
          contract_amount: Number(contract.value || 0),
          multiplier: Number(mult.value || 1)
        };
        try {
          const r = await paySalary(id, job.value, params);
          modal.remove();
          const box = document.getElementById('alertsContainer');
          if (box) {
            box.innerHTML = `<div class="alert alert-success">Зарплата ${Number(r.amount).toLocaleString('ru-RU')} ₽ начислена · платёж #${r.payment_id}</div>`;
            setTimeout(() => box.innerHTML = '', 4500);
          }
        } catch (e) {
          alert('Ошибка выдачи зарплаты: ' + e.message);
        }
      };
    }
  }, 0);
}
