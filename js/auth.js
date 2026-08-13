import { supabase } from './supabase-client.js';

// Вход
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Выход
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Получить текущего пользователя и его роль
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  // Получаем профиль (роль)
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, username')
    .eq('id', user.id)
    .single();

  if (profileError) throw profileError;
  return { ...user, role: profile.role, username: profile.username };
}

// Проверка, является ли пользователь администратором
export async function isAdmin() {
  const user = await getCurrentUser();
  return user?.role === 'admin';
}
