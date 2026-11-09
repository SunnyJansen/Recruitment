import { Panel } from "@/components/ui/panel";
import { createClient } from "@/lib/db/server";

export const metadata = { title: "Instellingen — Cr8las Recruitment" };

function formatValue(value: unknown) {
  if (typeof value === "string") return value || "—";
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · ");
  }
  if (value === true) return "Ja";
  if (value === false) return "Nee";
  return String(value);
}

export default async function InstellingenPage() {
  const supabase = await createClient();
  const { data: settings, error } = await supabase.from("settings").select("*").not("key", "like", "status_%").order("key");

  return (
    <Panel
      title="Instellingen"
      subtitle="Limieten, werktijden en AVG-regels. Wijzigen kan vanaf een volgende fase."
    >
      {error ? (
        <p className="text-[13px] text-danger-text">Instellingen laden is mislukt: {error.message}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-left">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="p-3 text-field-label text-muted-foreground">Instelling</th>
                <th className="p-3 text-field-label text-muted-foreground">Waarde</th>
                <th className="p-3 text-field-label text-muted-foreground">Uitleg</th>
              </tr>
            </thead>
            <tbody>
              {settings?.map((s) => (
                <tr key={s.key} className="border-b border-surface-border last:border-0 hover:bg-surface-raised">
                  <td className="p-3 font-mono text-[13px]">{s.key}</td>
                  <td className="p-3 text-app-body tabular-nums">{formatValue(s.value)}</td>
                  <td className="p-3 text-[13px] text-muted-foreground">{s.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
