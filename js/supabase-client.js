import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabaseUrl = 'https://bpodhjlqzfxesxjduujz.supabase.co';
const supabaseAnonKey = 'sb_publishable_EtMfPg9vVMa1la22ADd6fA_vpvRNM8x'; // замените на свой

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
