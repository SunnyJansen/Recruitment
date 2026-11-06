"use client";

import { LogIn } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { loginWithPassword, type PasswordState } from "./actions";

/** Tijdelijk inlogformulier met één gedeeld wachtwoord (SITE_PASSWORD). */
export function PasswordForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(loginWithPassword, {
    error: null,
  });

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      {/* Voor wachtwoordmanagers: één gedeeld teamaccount. */}
      <input type="text" name="username" autoComplete="username" value="cr8las-team" readOnly hidden />
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Wachtwoord</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          aria-invalid={state.error ? true : undefined}
        />
      </div>
      {state.error && (
        <p role="alert" className="text-[13px] text-danger-text">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="default" disabled={pending}>
        <LogIn />
        {pending ? "Controleren…" : "Log in"}
      </Button>
    </form>
  );
}
