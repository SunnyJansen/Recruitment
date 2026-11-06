"use client";

import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { useEffect, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { LINK_ERROR_MESSAGES, linkErrorKind, readLoginHash, safeNext } from "@/lib/auth/auth-links";
import { supabaseAnonKey, supabaseUrl } from "@/lib/db/env";

import { logLogin } from "./actions";

/**
 * Hier komt de inloglink uit de mail op uit. De inloggegevens staan achter
 * een # in het adres (alleen zichtbaar in de browser). We zetten daarmee de
 * sessie-cookies en sturen je door naar het dashboard.
 */
export function CompleteLogin() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      const url = new URL(window.location.href);
      const next = safeNext(url.searchParams.get("next"));

      // Oudere linkvormen doorsturen naar de juiste afhandeling.
      if (url.searchParams.get("code")) {
        window.location.replace(`/auth/callback${url.search}`);
        return;
      }
      if (url.searchParams.get("token_hash")) {
        window.location.replace(`/auth/confirm${url.search}`);
        return;
      }

      const hash = readLoginHash(window.location.hash);
      // Inloggegevens direct uit de adresbalk halen.
      history.replaceState(null, "", url.pathname + url.search);

      if (hash.errorCode || !hash.accessToken || !hash.refreshToken) {
        const kind = hash.errorCode
          ? linkErrorKind({ code: hash.errorCode, message: hash.errorDescription })
          : "link";
        setError(LINK_ERROR_MESSAGES[kind]);
        return;
      }

      const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
        isSingleton: false,
        auth: { detectSessionInUrl: false },
      });
      const { error } = await supabase.auth.setSession({
        access_token: hash.accessToken,
        refresh_token: hash.refreshToken,
      });
      if (error) {
        console.error("Sessie zetten mislukt:", error.code, error.message);
        setError(LINK_ERROR_MESSAGES[linkErrorKind({ code: error.code, message: error.message })]);
        return;
      }

      await logLogin().catch(() => {});
      // Volledig herladen, zodat de server de nieuwe cookies meteen ziet.
      window.location.replace(next);
    }
    run();
  }, []);

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-[13px] text-danger-text">
          {error}
        </p>
        <Link href="/login" className={buttonVariants({ variant: "default" })}>
          Nieuwe inloglink aanvragen
        </Link>
      </div>
    );
  }

  return (
    <p aria-live="polite" className="text-app-body text-muted-foreground">
      Je wordt ingelogd…
    </p>
  );
}
