import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';

let serverSupabase: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseKey) {
    return null;
  }
  if (!serverSupabase) {
    serverSupabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
      },
    });
  }
  return serverSupabase;
}

export const isServerSupabaseConfigured = (): boolean => {
  return Boolean(supabaseUrl && supabaseKey);
};
