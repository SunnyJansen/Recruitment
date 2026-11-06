/**
 * Supabase-instellingen uit .env.local. Ontbreken ze, dan toont de app
 * de pagina /setup met uitleg in plaats van te crashen.
 */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function hasSupabaseEnv() {
  return supabaseUrl.startsWith("http") && supabaseAnonKey.length > 20;
}
