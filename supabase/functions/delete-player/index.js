import { createClient } from 'https://deno.land/x/supabase_js@2.38.0/mod.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const auth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function requireAdmin(req) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Требуется авторизация');
  const { data: { user }, error } = await auth.auth.getUser(token);
  if (error || !user) throw new Error('Недействительная сессия');
  const { data: profile, error: profileError } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profileError || profile?.role !== 'admin') throw new Error('Недостаточно прав');
  return user;
}

Deno.serve(async req => {
  try {
    if (req.method !== 'POST') return json({ error: 'Метод не поддерживается' }, 405);
    await requireAdmin(req);
    const { userId } = await req.json();
    if (!userId) return json({ error: 'userId обязателен' }, 400);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return json({ error: error.message }, 400);
    return json({ message: 'Пользователь удалён' });
  } catch (err) {
    const message = err?.message || 'Ошибка сервера';
    return json({ error: message }, message === 'Недостаточно прав' ? 403 : 401);
  }
});
