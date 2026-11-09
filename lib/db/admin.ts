import "server-only";

import { createClient } from "@supabase/supabase-js";

import { supabaseUrl } from "./env";
import type { Database } from "./types";

/**
 * Supabase-client met de geheime service-key, voor taken zonder ingelogde
 * gebruiker (de automatische cron). Alleen op de server; nooit naar de browser.
 * Geeft null als SUPABASE_SERVICE_ROLE_KEY ontbreekt.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !supabaseUrl) return null;
  return createClient<Database>(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
