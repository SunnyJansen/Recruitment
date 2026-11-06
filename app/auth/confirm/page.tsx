import { LogIn } from "lucide-react";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { safeNext } from "@/lib/auth/auth-links";

import { confirmLogin } from "./actions";

export const metadata = { title: "Inloggen — Cr8las Recruitment" };

async function ConfirmForm({ searchParams }: { searchParams: PageProps<"/auth/confirm">["searchParams"] }) {
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const type = typeof params.type === "string" ? params.type : "email";
  const next = safeNext(typeof params.next === "string" ? params.next : "/");

  if (!tokenHash) {
    return (
      <p className="text-[13px] text-danger-text">
        Deze link is niet compleet. Vraag een nieuwe inloglink aan.
      </p>
    );
  }

  return (
    <form action={confirmLogin} className="flex flex-col gap-4">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="next" value={next} />
      <Button type="submit" variant="default">
        <LogIn />
        Log in
      </Button>
    </form>
  );
}

/** Landingspagina van de inloglink: één klik op de knop en je bent binnen. */
export default function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Panel
        className="w-full max-w-[400px]"
        title="Inloggen bevestigen"
        subtitle="Klik op de knop om in te loggen bij Cr8las Recruitment."
      >
        <Suspense fallback={<div className="h-9" />}>
          <ConfirmForm searchParams={searchParams} />
        </Suspense>
      </Panel>
    </main>
  );
}
