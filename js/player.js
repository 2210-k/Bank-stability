import { supabase } from './supabase-client.js';

// Получить свой профиль
export async function getMyProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Не авторизован');
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error) throw error;
  return data;
}

// Перевод другому игроку
export async function transferFunds(toUsername, amount) {
  const { data: { user } } = await supabase.auth.getUser();
  // Сначала найдём ID получателя по username
  const { data: toUser, error: findError } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', toUsername)
    .single();
  if (findError || !toUser) throw new Error('Получатель не найден');
  const { error } = await supabase.rpc('transfer_funds', {
    p_from: user.id,
    p_to: toUser.id,
    p_amount: amount
  });
  if (error) throw error;
}

// Оплатить штраф
export async function payFine(fineId) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.rpc('pay_fine', {
    p_fine_id: fineId,
    p_user_id: user.id
  });
  if (error) throw error;
}

// Погасить кредит
export async function repayCredit(creditId, amount) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.rpc('repay_credit', {
    p_credit_id: creditId,
    p_amount: amount,
    p_user_id: user.id
  });
  if (error) throw error;
}

// Получить свои штрафы
export async function getMyFines() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('fines')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_paid', false);
  if (error) throw error;
  return data;
}

// Получить свои кредиты
export async function getMyCredits() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('credits')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_closed', false);
  if (error) throw error;
  return data;
}

// Получить свою историю
export async function getMyTransactions() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .or(`from_user.eq.${user.id},to_user.eq.${user.id}`)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}
