"use client";

import { Mail } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/db/client";

const ERRORS: Record<string, string> = {
  link: "De inloglink is verlopen of al gebruikt. Vraag een nieuwe aan.",
};

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(
    initialError ? (ERRORS[initialError] ?? "Inloggen is mislukt. Probeer het opnieuw.") : null,
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      setState("idle");
      setError(
        /signups not allowed|not found|otp_disabled/i.test(error.message)
          ? "Dit e-mailadres heeft geen toegang. Vraag een beheerder om je toe te voegen."
          : error.status === 429
            ? "Te veel pogingen. Wacht een minuut en probeer het opnieuw."
            : `Versturen is mislukt: ${error.message}`,
      );
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <div className="flex flex-col gap-3 rounded-tile bg-surface-raised p-4">
        <p className="text-app-body">Check je mail</p>
        <p className="text-[13px] text-muted-foreground">
          We hebben een inloglink gestuurd naar <strong className="text-foreground">{email}</strong>.
          Open de link in deze browser. Geen mail? Kijk ook in je spam.
        </p>
        <Button variant="borderless" size="sm" className="self-start" onClick={() => setState("idle")}>
          Ander e-mailadres
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
      <Button type="submit" variant="default" disabled={state === "sending"}>
        <Mail />
        {state === "sending" ? "Versturen…" : "Stuur inloglink"}
      </Button>
    </form>
  );
}
