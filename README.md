# Cr8las Recruitment

AI-recruitmentsysteem voor lasvacatures in Nederland en Zuid-Afrika. Kandidaten
zoeken via LinkedIn (Unipile), matchen met Claude, berichten pas versturen na
menselijke goedkeuring. Zie `CLAUDE.md` voor de regels en `docs/PLAN.md` voor
de fases.

## Stand van zaken

- [x] **Fase 1 — Fundament**: Next.js, Sunny Apple-huisstijl, inloggen met
  magic link, alle databasetabellen, lege pagina's.
- [ ] Fase 2 — Vacatures & handmatige kandidaten

---

## Eenmalig instellen op je laptop

### 1. Programma's installeren
- **Node.js** (LTS-versie): https://nodejs.org
- **Git**: https://git-scm.com

### 2. Code ophalen
Open een terminal en typ:

```bash
git clone https://github.com/SunnyJansen/Recruitment.git
```

```bash
cd Recruitment
```

```bash
npm install
```

### 3. Supabase-project maken
1. Maak een gratis account op https://supabase.com en klik **New project**.
   - Naam: `cr8las-recruitment`
   - Regio: **West EU (Frankfurt)** of **Ireland**. Dan blijven de gegevens in de EU (AVG).
   - Bewaar het databasewachtwoord in je wachtwoordmanager.
2. Ga naar **SQL Editor** → **New query**. Plak de hele inhoud van
   `supabase/migrations/20261106000000_fundament.sql` en klik **Run**.
   Je ziet dan "Success. No rows returned".
3. Ga naar **Authentication → Sign In / Providers**:
   - Zet **Allow new users to sign up** **uit**. Zo kan alleen wie jij toevoegt inloggen.
   - Laat **Email** aan staan.
4. Ga naar **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000`
   - **Redirect URLs**: voeg `http://localhost:3000/**` toe.
5. Collega's (en jezelf) toevoegen: **Authentication → Users → Add user →
   Create new user**. Vul het e-mailadres in, verzin een willekeurig wachtwoord
   (dat wordt niet gebruikt) en vink **Auto Confirm User** aan.

### 4. Sleutels invullen
1. Kopieer `.env.example` naar een nieuw bestand `.env.local` (in dezelfde map).
2. In Supabase: **Project Settings → API Keys**. Daar staan de waarden die je nodig hebt:
   - `NEXT_PUBLIC_SUPABASE_URL`: de Project URL (bij **Data API**, of
     `https://<project-id>.supabase.co`).
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: de **Publishable key** (`sb_publishable_…`) of de
     oude **anon public** key. Beide werken.
   - `SUPABASE_SERVICE_ROLE_KEY`: de **Secret key**. Die heb je pas vanaf fase 3
     nodig. **Deze nooit delen.**
3. `.env.local` gaat nooit naar GitHub (staat in `.gitignore`).

### 5. Starten
```bash
npm run dev
```
Open http://localhost:3000 in je browser.

---

## Testen

| Wat | Hoe |
|---|---|
| Databaseregels (zonder Supabase) | `npm run test:db`: draait de migratie in een nep-database en controleert de harde regels |
| Codecontrole | `npm run lint` en `npm run build` |

## Mappen

```
app/              pagina's (Dashboard, Vacatures, Kandidaten, Berichten, Instellingen) + login
components/ui/    knoppen, velden, panelen: Sunny Apple-stijl, shadcn/ui-opzet
lib/db/           Supabase-koppeling, types, activity-log
proxy.ts          beschermt alle pagina's achter de login
supabase/         database-migraties (SQL)
scripts/          testscripts
docs/             plan, besluiten, huisstijl
```
