import { supabase } from './supabase-client.js';
import { getMyProfile, getMyFines, getMyCredits, getMyTransactions, payFine, repayCredit, transferFunds } from './player.js';
export { getMyProfile, getMyFines, getMyCredits, getMyTransactions, payFine, repayCredit, transferFunds };
export async function allPlayers(){ const {data:{user}}=await supabase.auth.getUser(); const {data,error}=await supabase.from('profiles').select('id,full_name,username,status,balance').neq('id',user.id).eq('status','active').order('full_name'); if(error)throw error; return data||[]; }
export async function notifications(){ const {data:{user}}=await supabase.auth.getUser(); const {data,error}=await supabase.from('bank_notifications').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100); if(error)throw error; return data||[]; }
export async function markNotification(id){ const {error}=await supabase.rpc('admin_mark_notification_read',{p_notification_id:id}); if(error)throw error; }
export async function salaryHistory(){ const {data:{user}}=await supabase.auth.getUser(); const {data,error}=await supabase.from('salary_payments').select('*').eq('player_id',user.id).order('created_at',{ascending:false}).limit(100); if(error)throw error; return data||[]; }
