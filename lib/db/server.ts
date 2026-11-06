import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabaseAnonKey, supabaseUrl } from "./env";
import type { Database } from "./types";

/**
 * Supabase-client voor op de server (server components, server actions,
 * route handlers). Werkt namens de ingelogde gebruiker, dus de
 * Row Level Security-regels in de database gelden.
 */
export async function createClient() {
  const cookieStore = await cookies();

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

/** Geeft de ingelogde gebruiker terug, of null. */
export async function getCurrentUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}
