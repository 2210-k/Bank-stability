import { createClient } from 'https://deno.land/x/supabase_js@2.38.0/mod.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const supabaseAdmin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const supabaseAuth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function requireAdmin(req) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Требуется авторизация');
  const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
  if (error || !user) throw new Error('Недействительная сессия');
  const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (profileError || profile?.role !== 'admin') throw new Error('Недостаточно прав');
  return user;
}

Deno.serve(async req => {
  try {
    if (req.method !== 'POST') return json({ error: 'Метод не поддерживается' }, 405);
    await requireAdmin(req);
    const { email, password, username } = await req.json();
    if (!email || !password || !username) return json({ error: 'Email, пароль и имя обязательны' }, 400);
    if (String(password).length < 6) return json({ error: 'Пароль должен содержать минимум 6 символов' }, 400);
    const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username } });
    if (error) return json({ error: error.message }, 400);
    return json({ user: data.user, message: 'Пользователь создан' });
  } catch (err) {
    const message = err?.message || 'Ошибка сервера';
    return json({ error: message }, message === 'Недостаточно прав' ? 403 : 401);
  }
});
