import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center p-4">
      <Panel className="w-full max-w-[420px]" title="Niet gevonden" subtitle="Deze pagina bestaat niet (meer).">
        <Button asChild variant="default" className="self-start">
          <Link href="/">Naar het dashboard</Link>
        </Button>
      </Panel>
    </main>
  );
}
