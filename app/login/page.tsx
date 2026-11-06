import { Suspense } from "react";

import { Panel } from "@/components/ui/panel";
import { safeNext } from "@/lib/auth/auth-links";
import { isPasswordMode } from "@/lib/auth/site-password";

import { LoginForm } from "./login-form";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Inloggen — Cr8las Recruitment" };

async function LoginContent({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : "/");
  if (isPasswordMode()) {
    return (
      <>
        <p className="-mt-2 text-[13px] text-muted-foreground">Testmodus: vul het teamwachtwoord in.</p>
        <PasswordForm next={next} />
      </>
    );
  }
  const error = typeof params.error === "string" ? params.error : undefined;
  return <LoginForm next={next} initialError={error} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Panel
        className="w-full max-w-[400px]"
        title="Inloggen"
        subtitle="Cr8las Recruitment"
      >
        <Suspense fallback={<div className="h-[118px]" />}>
          <LoginContent searchParams={searchParams} />
        </Suspense>
      </Panel>
    </main>
  );
}
