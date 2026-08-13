/* Stability Bank 3.0 admin hotfix: modal actions, RPC wrappers, notifications */
import { supabase } from './supabase-client.js';

const rpc = async (name, args) => { const {data,error}=await supabase.rpc(name,args); if(error) throw error; return data; };
export const balanceOperation=(playerId,amount,description)=>rpc('admin_balance_operation',{p_amount:Number(amount),p_description:description||'Операция администратора',p_player_id:playerId});
export const updatePlayerProfile=(playerId,fullName,birthDate,passport,username)=>rpc('admin_update_player_profile',{p_player_id:playerId,p_full_name:fullName,p_birth_date:birthDate||null,p_passport_number:passport,p_username:username});
export const issueSalary=(playerId,jobKey,jobTitle,amount,units=1,parameters={})=>rpc('admin_issue_salary',{p_player_id:playerId,p_job_key:jobKey,p_job_title:jobTitle,p_amount:Number(amount),p_units:Number(units)||1,p_parameters:parameters});
export const issueNotification=(playerId,title,message,kind='info')=>rpc('bank_create_notification',{p_user_id:playerId,p_title:title,p_message:message,p_kind:kind});
export const issueFine=(playerId,amount,title,reason)=>rpc('admin_issue_penalty',{p_player_id:playerId,p_amount:Number(amount),p_title:title,p_reason:reason});
export const deleteTransaction=id=>rpc('admin_delete_transaction',{p_transaction_id:String(id)});
export const clearPlayerHistory=id=>rpc('admin_clear_player_history',{p_player_id:id});

export function wireModalClose(root=document){
  const close=()=>document.querySelectorAll('.modal,.modal-overlay,.dialog,.popup').forEach(x=>{x.classList.remove('open','show','active');x.style.display='none';});
  root.querySelectorAll('[data-close-modal],.modal-close,.close-modal,.modal .close,.modal-header .close,.modal button[aria-label="Close"]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();close();}));
  root.querySelectorAll('.modal,.modal-overlay').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)close();}));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
}

export async function sendNotification(playerId,title,message,kind='info'){if(!title||!message)throw new Error('Заполните заголовок и текст уведомления');return issueNotification(playerId,title,message,kind);}
export async function deposit(playerId,amount,description='Пополнение администратором'){if(Number(amount)<=0)throw new Error('Сумма должна быть больше 0');return balanceOperation(playerId,Number(amount),description);}
export async function withdraw(playerId,amount,description='Снятие администратором'){if(Number(amount)<=0)throw new Error('Сумма должна быть больше 0');return balanceOperation(playerId,-Number(amount),description);}
