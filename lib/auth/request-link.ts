"use client";

import { createClient } from "@supabase/supabase-js";

import { supabaseAnonKey, supabaseUrl } from "@/lib/db/env";

/**
 * Vraagt een inloglink aan die in ELKE browser werkt, ook met de
 * standaardmail van Supabase.
 *
 * Waarom een aparte client: de Supabase-client voor Next.js gebruikt altijd
 * de "PKCE"-methode. Die link werkt alleen in de browser waar hij is
 * aangevraagd. Deze client gebruikt de "implicit"-methode: Supabase zet de
 * inloggegevens dan achter een # in de link, en /auth/complete zet daarmee
 * de sessie. Deze client bewaart zelf niets.
 */
export async function requestLoginLink(email: string, next: string) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: "implicit",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const redirectTo = new URL("/auth/complete", window.location.origin);
  redirectTo.searchParams.set("next", next);

  return supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      // Alleen collega's die al als gebruiker zijn toegevoegd mogen inloggen.
      shouldCreateUser: false,
      emailRedirectTo: redirectTo.toString(),
    },
  });
}
