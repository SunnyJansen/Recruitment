/**
 * Berichtteksten voor automatisch benaderen. Puur en los te testen.
 * Het invullen gebeurt in de database (render_campaign_message); deze
 * functie doet precies hetzelfde voor de voorbeeldweergave op het scherm.
 */

export const PLACEHOLDERS = [
  { key: "{voornaam}", label: "Voornaam kandidaat" },
  { key: "{functie}", label: "Functietitel van de vacature" },
  { key: "{plaats}", label: "Locatie van de vacature" },
  { key: "{afzender}", label: "Jouw naam (Instellingen)" },
  { key: "{afzender_functie}", label: "Jouw functie" },
  { key: "{bedrijf}", label: "Bedrijfsnaam" },
] as const;

export type TemplateVars = {
  fullName: string;
  vacancyTitle: string;
  vacancyLocation: string | null;
  language: "nl" | "en";
  senderName: string;
  senderTitle: string;
  companyName: string;
};

/** Zelfde volgorde en regels als public.render_campaign_message(). */
export function renderTemplate(template: string, v: TemplateVars): string {
  const firstName = v.fullName.trim().split(" ")[0] ?? "";
  const place = v.vacancyLocation?.trim() || (v.language === "nl" ? "jouw regio" : "your region");
  return template
    .replaceAll("{voornaam}", firstName)
    .replaceAll("{functie}", v.vacancyTitle)
    .replaceAll("{plaats}", place)
    .replaceAll("{afzender_functie}", v.senderTitle)
    .replaceAll("{afzender}", v.senderName)
    .replaceAll("{bedrijf}", v.companyName);
}

/** LinkedIn staat berichten tot 8.000 tekens toe; wij houden het kort. */
export const MAX_MESSAGE_LENGTH = 1500;

/**
 * Controle vóór goedkeuren (AVG, harde regel 3): elk eerste bericht noemt de
 * bron (LinkedIn) en heeft een afmeldoptie. Geeft een lijst met problemen.
 */
export function checkTemplate(text: string, language: "nl" | "en"): string[] {
  const t = text.trim();
  const problems: string[] = [];
  const name = language === "nl" ? "Nederlandse" : "Engelse";
  if (!t) return [`De ${name} tekst is leeg.`];
  if (t.length > MAX_MESSAGE_LENGTH) problems.push(`De ${name} tekst is te lang (max. ${MAX_MESSAGE_LENGTH} tekens).`);
  if (!/linkedin/i.test(t)) problems.push(`De ${name} tekst moet de bron noemen, bijv. "Ik vond je profiel op LinkedIn".`);
  const optOut =
    language === "nl"
      ? /geen interesse|afmeld|niet meer benader|laat (het )?weten|stop/i
      : /not interested|unsubscribe|won'?t contact|no longer contact|let me know|opt.?out/i;
  if (!optOut.test(t)) {
    problems.push(
      language === "nl"
        ? 'De Nederlandse tekst moet een afmeldoptie hebben, bijv. "Geen interesse? Laat het weten, dan benader ik je niet meer."'
        : 'De Engelse tekst moet een afmeldoptie hebben, bijv. "Not interested? Let me know and I won\'t contact you again."',
    );
  }
  const unknown = [...t.matchAll(/\{[^}]*\}/g)].map((m) => m[0]).filter((p) => !PLACEHOLDERS.some((x) => x.key === p));
  if (unknown.length) problems.push(`Onbekend invulveld: ${[...new Set(unknown)].join(", ")}.`);
  return problems;
}

export const DEFAULT_TEMPLATE_NL = `Hoi {voornaam},

Ik vond je profiel op LinkedIn en zag je ervaring als lasser. Bij {bedrijf} zoeken we een {functie} in {plaats}. Lijkt het je interessant om hier eens kort over te praten?

Groet,
{afzender}
{afzender_functie}, {bedrijf}

Geen interesse? Laat het weten, dan benader ik je niet meer.`;

export const DEFAULT_TEMPLATE_EN = `Hi {voornaam},

I found your profile on LinkedIn and noticed your welding experience. At {bedrijf} we are looking for a {functie} in {plaats}. Would you be open to a short chat about it?

Best regards,
{afzender}
{afzender_functie}, {bedrijf}

Not interested? Let me know and I won't contact you again.`;

/**
 * Herkent een afmelding in een reactie (harde regel 3: "geen interesse" of
 * afmelden → nooit meer benaderen). Bewust ruim: bij twijfel liever afmelden.
 * De AI-indeling van reacties volgt in een latere fase.
 */
export function isOptOutReply(text: string): boolean {
  const t = text.toLowerCase().replace(/\s+/g, " ").trim();
  return [
    /\bgeen interesse\b/,
    /\bniet ge[iï]nteresseerd\b/,
    /\bafmeld/,
    /\bmeld me af\b/,
    /\bniet meer (benaderen|contacteren|mailen|berichten)\b/,
    /\blaat me (met rust|maar)\b/,
    /^stop[.!]*$/,
    /\bstop (met|maar)\b/,
    /\bnot interested\b/,
    /\bno interest\b/,
    /\bunsubscribe\b/,
    /\bdon'?t contact\b/,
    /\bdo not contact\b/,
    /\bremove me\b/,
    /\bno thanks?\b/,
    /\bnee,? dank/,
  ].some((re) => re.test(t));
}
