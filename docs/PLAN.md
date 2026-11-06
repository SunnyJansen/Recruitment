# Bouwplan — AI Recruitment Systeem

Werk fase voor fase. Elke fase eindigt met iets dat je zelf kunt testen.

---

## Fase 0 — Voorbereiding (zelf doen, ±1 uur)
- [ ] Account aanmaken: **Supabase**, **Vercel**, **Resend**, **Anthropic Console** (API-key), **Unipile**
- [ ] In Unipile: LinkedIn-account koppelen (bij voorkeur Sales Navigator of Recruiter voor betere zoekfilters)
- [ ] Noteer uit Unipile-dashboard: **DSN** (base URL), **API-key**, **account_id**
- [ ] Node.js (LTS) en Git installeren, Claude Code installeren
- [ ] Lege map maken, deze starter-bestanden erin zetten, `.env.example` kopiëren naar `.env.local` en invullen

## Fase 1 — Fundament ✅ (afgerond 6 nov 2026, inloggen tijdelijk met teamwachtwoord)
- Next.js + TypeScript + Tailwind + shadcn/ui opzetten
- Supabase koppelen, login (e-mail magic link)
- Migrations voor alle tabellen uit CLAUDE.md
- Lege pagina's: Dashboard, Vacatures, Kandidaten, Berichten, Instellingen

**Test:** inloggen werkt, tabellen staan in Supabase.

## Fase 2 — Vacatures & handmatige kandidaten
- Vacatures aanmaken/bewerken (titel, omschrijving, eisen, locatie)
- Kandidaat handmatig toevoegen + kandidaatdetailpagina met tijdlijn (`activity_log` + `messages`)

**Test:** vacature + kandidaat aanmaken, koppelen, stage wijzigen.

## Fase 3 — Unipile: zoeken & importeren
- `/lib/unipile` client met `X-API-KEY` header en DSN uit env
- Zoekscherm per vacature: trefwoorden, functie, locatie, ervaring → Unipile LinkedIn search (`api_type` instelbaar)
- Resultaten tonen met vinkjes → geselecteerde profielen importeren
- Bij import: volledig profiel ophalen, **dedupliceren op `linkedin_provider_id`**, opslaan, loggen
- Rate limiting op profielbezoeken

**Test:** zoek "lasser TIG Limburg", importeer 5 kandidaten, geen dubbelen bij tweede import.

## Fase 4 — AI-matching
- `/lib/ai/match.ts`: Claude krijgt vacature + profiel → JSON `{score, reden, sterke_punten, twijfels}`
- Score + reden zichtbaar in kandidatenlijst, sorteerbaar
- Duidelijk label: "AI-advies — beslissing door recruiter"

**Test:** 5 kandidaten scoren, redenen zijn logisch.

## Fase 5 — Berichten opstellen & goedkeuren
- `/lib/ai/writeMessage.ts`: persoonlijk bericht per kanaal
  - connectieverzoek: max. 300 tekens
  - LinkedIn-bericht / e-mail: kort, persoonlijk, bronvermelding + afmeldzin
- Toon/stijl instelbaar (informeel/formeel, NL/EN)
- **Goedkeuringsscherm**: lijst met concepten → bewerken → goedkeuren/afwijzen (ook bulk-goedkeuren)

**Test:** concepten maken, eentje aanpassen, goedkeuren.

## Fase 6 — Verzenden via wachtrij
- Queue: goedgekeurde berichten → `queued` → verstuurd binnen limieten, werktijden en met willekeurige pauzes
- LinkedIn: uitnodiging met bericht, of chat starten als al connectie
- E-mail via Resend (als e-mail bekend is)
- Vercel Cron draait de queue elke paar minuten
- Status `sent`/`failed` + foutmelding opslaan

**Test:** 2 berichten naar je eigen testaccount; limieten werken (zet tijdelijk limiet op 1).

## Fase 7 — Reacties & opvolging
- Webhook-endpoint `/api/webhooks/unipile` (nieuw bericht, geaccepteerde uitnodiging) met verificatie
- Inkomend bericht opslaan, kandidaat → `replied`, melding in dashboard
- `/lib/ai/classifyReply.ts`: interesse / geen interesse / vraag / afmelden → bij afmelden direct `opted_out`
- Opvolging: geen reactie na X dagen → concept-opvolgbericht (stap 1, 2, max 3), weer via goedkeuring
- Geaccepteerde uitnodiging → eerste echte bericht klaarzetten

**Test:** reageer vanaf testaccount → verschijnt in systeem; opvolging verschijnt na (tijdelijk) 1 dag.

## Fase 8 — Dashboard & AVG
- Pipeline per vacature (kanban: new → contacted → replied → interview → placed)
- Cijfers: benaderd, responsratio, acceptatieratio, per vacature/week
- Dagelijkse limiet-teller zichtbaar
- Cron: anonimiseren na `retention_days`; export/verwijder-knop per kandidaat (inzageverzoek)

**Test:** pipeline klopt, anonimisering werkt op testdata.

## Fase 9 — Live
- Deploy naar Vercel, env-vars instellen, webhook-URL registreren in Unipile
- Rustig opbouwen: week 1 max. 10 uitnodigingen/dag, daarna langzaam omhoog
- Privacyverklaring voor kandidaten klaarzetten (link in afmeldzin)

---

## Later (optioneel)
- WhatsApp Business API (Twilio) als extra kanaal
- Meerdere LinkedIn-accounts / teamleden
- Koppeling met ATS/CRM
- Cv-upload + parsing
