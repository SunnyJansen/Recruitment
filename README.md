# Cr8las Recruitment

AI-recruitmentsysteem voor lasvacatures in Nederland en Zuid-Afrika. Kandidaten
zoeken via LinkedIn (Unipile), matchen met Claude, berichten pas versturen na
menselijke goedkeuring. Zie `CLAUDE.md` voor de regels en `docs/PLAN.md` voor
de fases.

**Je hoeft niets op je laptop te installeren.** Alles werkt in de browser:

| Wat | Waar |
|---|---|
| Code schrijven | Claude Code (cloud), die pusht naar GitHub |
| Tests | GitHub draait ze automatisch, zie tabblad **Actions** |
| App bekijken en testen | Vercel bouwt de app automatisch na elke push |
| Database en logins | Supabase-dashboard |

## Stand van zaken

- [x] **Fase 1 — Fundament**: Next.js, Sunny Apple-huisstijl, inloggen met
  magic link, alle databasetabellen, lege pagina's.
- [ ] Fase 2 — Vacatures & handmatige kandidaten

---

## Eenmalig instellen (alles in de browser, ±30 minuten)

### Stap 1 — Supabase (database + login)
1. Maak een gratis account op https://supabase.com en klik **New project**.
   - Naam: `cr8las-recruitment`
   - Regio: **Central EU (Frankfurt)** of **West EU (Ireland)**, zodat de gegevens in de EU blijven (AVG).
   - Bewaar het databasewachtwoord in je wachtwoordmanager.
2. **SQL Editor** → **New query**. Open in GitHub het bestand
   `supabase/migrations/20261106000000_fundament.sql`, klik rechtsboven op het
   kopieer-icoon, plak de inhoud in de SQL Editor en klik **Run**. Je ziet dan
   "Success. No rows returned".
3. **Authentication → Sign In / Providers**: zet **Allow new users to sign up**
   **uit**. Zo kan alleen wie jij toevoegt inloggen. Laat **Email** aan staan.
4. **Authentication → Users → Add user → Create new user**: vul je eigen
   e-mailadres in, verzin een willekeurig wachtwoord (dat wordt niet gebruikt)
   en vink **Auto Confirm User** aan. Collega's voeg je later op dezelfde manier toe.
5. Laat dit tabblad open. Bij stap 3 heb je het weer nodig.

### Stap 2 — Vercel (de app online zetten)
1. Ga naar https://vercel.com/signup en kies **Continue with GitHub**
   (plan: **Hobby**, gratis).
2. **Add New… → Project** → kies de repository **Recruitment** → **Import**.
   Zie je hem niet, klik dan **Adjust GitHub App Permissions** en geef Vercel
   toegang tot `Recruitment`.
3. Open vóór je op Deploy klikt **Environment Variables** en voeg toe
   (waarden staan in Supabase onder **Project Settings → API Keys**):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | de Project URL, `https://<project-id>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | de **Publishable key** (`sb_publishable_…`) |

4. Klik **Deploy**. Na ±1 minuut krijg je een adres zoals
   `https://recruitment-xxxx.vercel.app`. Dat is jouw app.

> Later voeg je hier ook de andere sleutels uit `.env.example` toe
> (Unipile, Anthropic, Resend). Na het toevoegen of wijzigen van een sleutel:
> **Deployments → ⋯ → Redeploy**.

### Stap 3 — Supabase laten weten waar de app staat
Terug in Supabase: **Authentication → URL Configuration**:
- **Site URL**: je Vercel-adres, bijv. `https://recruitment-xxxx.vercel.app`
- **Redirect URLs** → **Add URL**: hetzelfde adres met `/**` erachter,
  bijv. `https://recruitment-xxxx.vercel.app/**`

Zonder deze stap werkt de inloglink uit de e-mail niet.

### Stap 4 — Eigen mailserver (aanbevolen)
De standaard-inlogmail werkt, maar de ingebouwde mail van Supabase verstuurt
maximaal 2 inlogmails per uur. Volg `docs/INLOGMAIL.md` om Supabase via Resend
te laten mailen.

---

## Testen

| Wat | Hoe |
|---|---|
| Databaseregels, inloggen (in een echte browser), lint en build | Automatisch bij elke push. GitHub → **Actions** → groen vinkje = in orde |
| De app zelf | Je Vercel-adres openen in de browser |
| Nieuwe versie | Vercel bouwt na elke push zelf een nieuwe versie (tabblad **Deployments**) |

## Sleutels en geheimen
Sleutels staan **alleen** in Vercel (Settings → Environment Variables) en
nooit in de code of in GitHub. `.env.example` laat zien welke er zijn.
Wil je later toch lokaal werken, dan zet je ze in `.env.local`. Dat bestand
gaat ook nooit naar GitHub.

## Mappen

```
app/              pagina's (Dashboard, Vacatures, Kandidaten, Berichten, Instellingen) + login
components/ui/    knoppen, velden, panelen: Sunny Apple-stijl, shadcn/ui-opzet
lib/db/           Supabase-koppeling, types, activity-log
proxy.ts          beschermt alle pagina's achter de login
supabase/         database-migraties (SQL)
scripts/          testscripts (draaien automatisch op GitHub)
.github/          automatische controle bij elke push
docs/             plan, besluiten, huisstijl
```
