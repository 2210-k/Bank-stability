import { supabase } from './supabase-client.js';

// ---------- Получить всех игроков ----------
export async function getAllPlayers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ---------- Обновить профиль игрока ----------
export async function updatePlayerProfile(userId, updates) {
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);
  if (error) throw error;
}

// ---------- Пополнение баланса ----------
export async function depositFunds(userId, amount, description = 'Пополнение админом') {
  const { error } = await supabase.rpc('deposit_funds', {
    p_user_id: userId,
    p_amount: amount,
    p_description: description
  });
  if (error) throw error;
}

// ---------- Снятие средств ----------
export async function withdrawFunds(userId, amount, description = 'Снятие админом') {
  const { error } = await supabase.rpc('withdraw_funds', {
    p_user_id: userId,
    p_amount: amount,
    p_description: description
  });
  if (error) throw error;
}

// ---------- Выдать штраф ----------
export async function issueFine(userId, amount, reason, adminId) {
  const { error } = await supabase.rpc('issue_fine', {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
    p_admin_id: adminId
  });
  if (error) throw error;
}

// ---------- Отменить штраф ----------
export async function cancelFine(fineId, adminId) {
  const { error } = await supabase.rpc('cancel_fine', {
    p_fine_id: fineId,
    p_admin_id: adminId
  });
  if (error) throw error;
}

// ---------- Выдать кредит ----------
export async function issueCredit(userId, amount, interest) {
  const { error } = await supabase.rpc('issue_credit', {
    p_user_id: userId,
    p_amount: amount,
    p_interest: interest
  });
  if (error) throw error;
}

// ---------- Начислить зарплату (новая функция, без привязки к работе) ----------
export async function paySalary(userId, job, params) {
  const { data, error } = await supabase.rpc('pay_salary_direct', {
    p_user_id: userId,
    p_job: job,
    p_params: params
  });
  if (error) throw error;
  return data.amount;
}

// ---------- Получить активные штрафы игрока ----------
export async function getUserFines(userId) {
  const { data, error } = await supabase
    .from('fines')
    .select('*')
    .eq('user_id', userId)
    .eq('is_paid', false);
  if (error) throw error;
  return data;
}

// ---------- Получить активные кредиты игрока ----------
export async function getUserCredits(userId) {
  const { data, error } = await supabase
    .from('credits')
    .select('*')
    .eq('user_id', userId)
    .eq('is_closed', false);
  if (error) throw error;
  return data;
}

// ---------- Получить историю транзакций игрока ----------
export async function getUserTransactions(userId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .or(`from_user.eq.${userId},to_user.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}

// ---------- Получить ВСЕ штрафы игрока (включая оплаченные) ----------
export async function getAllFinesForUser(userId) {
  const { data, error } = await supabase
    .from('fines')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ---------- Удалить игрока (из auth.users, каскадно удалит профиль) ----------
export async function deletePlayer(userId) {
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw error;
}

// ---------- Создание игрока через Edge Function ----------
export async function createPlayer(email, password, username) {
  const { data, error } = await supabase.functions.invoke('create-player', {
    body: { email, password, username }
  });
  if (error) {
    if (error.message?.includes('function not found')) {
      throw new Error('Edge Function "create-player" не развёрнута. Разверните её через supabase functions deploy create-player');
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
