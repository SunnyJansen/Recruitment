import { Panel } from "@/components/ui/panel";

import { CompleteLogin } from "./complete-login";

export const metadata = { title: "Inloggen — Cr8las Recruitment" };

export default function CompletePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Panel className="w-full max-w-[400px]" title="Inloggen">
        <CompleteLogin />
      </Panel>
    </main>
  );
}
