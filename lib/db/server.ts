import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { isPasswordMode } from "../auth/site-password";

import { supabaseAnonKey, supabaseUrl } from "./env";
import type { Database } from "./types";

/**
 * Supabase-client voor op de server (server components, server actions,
 * route handlers).
 *
 * - Normaal: werkt namens de ingelogde gebruiker, dus de Row Level
 *   Security-regels in de database gelden.
 * - Wachtwoordmodus (SITE_PASSWORD gezet): er is geen Supabase-gebruiker,
 *   dus de server gebruikt de geheime service-key. Die key blijft altijd op
 *   de server en komt nooit in de browser. proxy.ts laat alleen mensen met
 *   het juiste wachtwoord door.
 */
export async function createClient() {
  // Cookies lezen maakt de pagina altijd "per verzoek" (nooit vooraf gebouwd met oude data).
  const cookieStore = await cookies();

  if (isPasswordMode()) {
    return createSupabaseClient<Database>(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Aangeroepen vanuit een server component: cookies kunnen daar niet
          // gezet worden. Geen probleem, proxy.ts ververst de sessie al.
        }
      },
    },
  });
}

export type CurrentUser = { id: string | null; email: string; passwordMode: boolean };

/** Geeft de ingelogde gebruiker terug, of null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  await cookies(); // per verzoek bepalen, niet tijdens het bouwen
  if (isPasswordMode()) {
    // proxy.ts heeft het wachtwoord al gecontroleerd.
    return { id: null, email: "Testmodus (wachtwoord)", passwordMode: true };
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "", passwordMode: false };
}
