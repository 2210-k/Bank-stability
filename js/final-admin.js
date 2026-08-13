import { supabase } from './supabase-client.js';
import { paySalary, SALARY_JOBS, calculateSalary } from './admin.js';

const rpc = async (name, params) => { const { data, error } = await supabase.rpc(name, params); if (error) throw new Error(error.message || 'Ошибка серверной операции'); return data; };
export { paySalary, SALARY_JOBS, calculateSalary };

export async function players(){ const {data,error}=await supabase.from('profiles').select('*').order('created_at',{ascending:false}); if(error)throw error; return data||[]; }
export async function fines(){ const {data,error}=await supabase.from('fines').select('*').order('created_at',{ascending:false}).limit(300); if(error)throw error; return data||[]; }
export async function credits(){ const {data,error}=await supabase.from('credits').select('*').order('created_at',{ascending:false}).limit(300); if(error)throw error; return data||[]; }
export async function transactions(){ const {data,error}=await supabase.from('transactions').select('*').order('created_at',{ascending:false}).limit(500); if(error)throw error; return data||[]; }
export async function playerTransactions(id){ const {data,error}=await supabase.from('transactions').select('*').or(`from_user.eq.${id},to_user.eq.${id}`).order('created_at',{ascending:false}).limit(300); if(error)throw error; return data||[]; }
export async function playerFines(id){ const {data,error}=await supabase.from('fines').select('*').eq('user_id',id).order('created_at',{ascending:false}); if(error)throw error; return data||[]; }
export async function playerCredits(id){ const {data,error}=await supabase.from('credits').select('*').eq('user_id',id).order('created_at',{ascending:false}); if(error)throw error; return data||[]; }
export async function deleteHistory(id){ return rpc('admin_delete_transaction',{p_transaction_id:String(id)}); }
export async function clearPlayerHistory(id){ return rpc('admin_clear_player_history',{p_player_id:id}); }
export async function updateProfile(id,p){ return rpc('admin_update_player_profile',{p_player_id:id,p_full_name:p.full_name||'',p_birth_date:p.birth_date||null,p_passport_number:p.passport_number||'',p_username:p.username||''}); }
export async function status(id,s){ return rpc('admin_set_player_status',{p_player_id:id,p_status:s}); }
export async function deposit(id,a,d){ return rpc('admin_balance_operation',{p_amount:Math.abs(Number(a)),p_description:d||'Пополнение админом',p_player_id:id}); }
export async function withdraw(id,a,d){ return rpc('admin_balance_operation',{p_amount:-Math.abs(Number(a)),p_description:d||'Снятие админом',p_player_id:id}); }
export async function fine(id,a,r){ return rpc('admin_issue_penalty',{p_amount:Number(a),p_player_id:id,p_reason:r||'Штраф',p_title:r||'Штраф'}); }
export async function cancelFine(id){ return rpc('cancel_fine',{p_fine_id:id,p_admin_id:null}); }
export async function credit(id,a,i){ return rpc('issue_credit',{p_user_id:id,p_amount:Number(a),p_interest:Number(i)||0}); }
export async function notify(id,title,message,kind='info'){ return rpc('bank_create_notification',{p_user_id:id,p_title:title,p_message:message,p_kind:kind}); }
export async function myNotifications(){ const {data:{user}}=await supabase.auth.getUser(); const {data,error}=await supabase.from('bank_notifications').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100); if(error)throw error; return data||[]; }
export async function readNotification(id){ return rpc('admin_mark_notification_read',{p_notification_id:id}); }
