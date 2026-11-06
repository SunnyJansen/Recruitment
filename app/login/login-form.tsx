"use client";

import { Mail } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LINK_ERROR_MESSAGES, linkErrorKind, type LinkErrorKind } from "@/lib/auth/auth-links";
import { describeLoginError } from "@/lib/auth/login-errors";
import { createClient } from "@/lib/db/client";

/** Supabase staat per e-mailadres maar één inlogmail per minuut toe. */
const RESEND_COOLDOWN_SECONDS = 60;

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(
    initialError
      ? (LINK_ERROR_MESSAGES[initialError as LinkErrorKind] ?? LINK_ERROR_MESSAGES.link)
      : null,
  );

  // Supabase zet een fout bij een mislukte link soms achter een # in het adres.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const code = hash.get("error_code") ?? hash.get("error");
    if (!code) return;
    const kind = linkErrorKind({ code, message: hash.get("error_description") });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- eenmalig lezen van de URL bij laden
    setError(LINK_ERROR_MESSAGES[kind]);
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  const [wait, setWait] = useState(0);

  // Aftellen zolang opnieuw aanvragen nog niet kan.
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (wait > 0) return;
    setState("sending");
    setError(null);

    const supabase = createClient();
    const redirectTo = new URL("/auth/callback", window.location.origin);
    redirectTo.searchParams.set("next", next);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // Alleen collega's die al als gebruiker zijn toegevoegd mogen inloggen.
        shouldCreateUser: false,
        emailRedirectTo: redirectTo.toString(),
      },
    });

    if (error) {
      const info = describeLoginError(error);
      setState("idle");
      setError(info.message);
      setWait(info.waitSeconds);
      return;
    }
    setState("sent");
    setWait(RESEND_COOLDOWN_SECONDS);
  }

  if (state === "sent") {
    return (
      <div className="flex flex-col gap-3 rounded-tile bg-surface-raised p-4">
        <p className="text-app-body">Check je mail</p>
        <p className="text-[13px] text-muted-foreground">
          We hebben een inloglink gestuurd naar <strong className="text-foreground">{email}</strong>. Open
          de link in deze browser. Geen mail? Kijk ook in je spam. Vraag niet meteen een nieuwe aan,
          want het aantal inlogmails per uur is beperkt.
        </p>
        <Button
          variant="borderless"
          size="sm"
          className="self-start"
          disabled={wait > 0}
          onClick={() => setState("idle")}
        >
          {wait > 0 ? `Opnieuw versturen kan over ${wait} s` : "Opnieuw versturen of ander e-mailadres"}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mailadres</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          placeholder="naam@cr8las.nl"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-danger-text">
          {error}
        </p>
      )}
      <Button type="submit" variant="default" disabled={state === "sending" || wait > 0}>
        <Mail />
        {state === "sending"
          ? "Versturen…"
          : wait > 0
            ? `Wacht nog ${wait} s`
            : "Stuur inloglink"}
      </Button>
    </form>
  );
}
