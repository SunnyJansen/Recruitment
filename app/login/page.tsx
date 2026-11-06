import { Suspense } from "react";

import { Panel } from "@/components/ui/panel";

import { LoginForm } from "./login-form";

export const metadata = { title: "Inloggen — Cr8las Recruitment" };

async function LoginContent({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  const next =
    typeof params.next === "string" && params.next.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "/";
  const error = typeof params.error === "string" ? params.error : undefined;
  return <LoginForm next={next} initialError={error} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Panel
        className="w-full max-w-[400px]"
        title="Inloggen"
        subtitle="Cr8las Recruitment. Je krijgt een inloglink per e-mail."
      >
        <Suspense fallback={<div className="h-[118px]" />}>
          <LoginContent searchParams={searchParams} />
        </Suspense>
      </Panel>
    </main>
  );
}
