# Automatisch benaderen instellen

Per vacature keur je één keer de zoekopdracht en de berichttekst goed. Daarna
benadert het systeem elke werkdag zelf nieuwe kandidaten, binnen de
LinkedIn-limieten. Wie reageert, zie je op je dashboard.

## Hoe het werkt
1. Elke paar minuten roept een gratis dienst (cron-job.org) de app aan.
2. Per keer doet de app **hoogstens één** LinkedIn-actie, met een willekeurige pauze
   ertussen, alleen op werkdagen tussen 08:00 en 18:00 (niet op feestdagen):
   - **zoeken**: nieuwe kandidaten uit jouw zoekopdracht (geen profielbezoek nodig);
   - **uitnodigen**: uitnodiging met jouw **korte uitnodigingstekst** (max. 200 tekens),
     max. het aantal uit Instellingen (`max_invites_per_day`, nu 10; week: 100). Een gratis
     LinkedIn-account mag ±15 uitnodigingen **mét tekst per week** (`max_invite_notes_per_week`);
     daarboven, of als LinkedIn de tekst weigert, gaan uitnodigingen **zonder tekst** (dan een week lang);
   - **bericht**: wie de uitnodiging accepteert, krijgt jouw goedgekeurde tekst
     (Nederlands of Engels, met bronvermelding en afmeldzin), max. 50 per dag.
3. **Reacties** worden elke 5–12 minuten opgehaald. Reageert iemand, dan staat die
   kandidaat op je **dashboard**. Bij "geen interesse", "stop" of iets vergelijkbaars
   wordt de kandidaat **direct afgemeld** en nooit meer benaderd.
4. Uitnodigingen die na 21 dagen niet geaccepteerd zijn, worden niet meer gevolgd.
5. Iemand die al door een andere vacature benaderd is, wordt niet nóg eens benaderd.

**Regel 1 blijft overeind:** de database controleert dat elk automatisch bericht
**exact** de door jou goedgekeurde tekst is (alleen de invulvelden ingevuld).
Wijzig je de tekst of zoekopdracht, dan stopt de campagne tot je opnieuw goedkeurt.

---

## Eenmalig instellen (±15 minuten)

### Stap 1 — Database bijwerken
Supabase → **SQL Editor** → plak en **Run**, in deze volgorde (elk in een eigen query):
1. `supabase/migrations/20261111000000_automatisch_benaderen.sql`
2. `supabase/migrations/20261112000000_uitnodigingstekst.sql`

### Stap 2 — Twee sleutels in Vercel
Vercel → je project → **Settings → Environment Variables**:

| Name | Value |
|---|---|
| `CRON_SECRET` | een lange willekeurige tekst van minstens 32 tekens (laat je wachtwoordmanager er een maken). **Niet in de chat plakken.** |
| `SUPABASE_SERVICE_ROLE_KEY` | staat er al (testmodus). Zo niet: Supabase → Project Settings → API Keys → **Secret key** |

Daarna **Deployments → ⋯ → Redeploy**.

### Stap 3 — cron-job.org (gratis)
1. Maak een account op https://cron-job.org.
2. **Create cronjob**:
   - **URL:** `https://<jouw-vercel-adres>/api/cron/outreach`
   - **Execution schedule:** every **5 minutes**
3. Open **Advanced** → **Headers** → voeg toe:
   - Key: `Authorization`
   - Value: `Bearer ` gevolgd door je `CRON_SECRET` (dus `Bearer jouwgeheimetekst…`)
4. **Save**. Bij **History** zie je na een paar minuten de eerste aanroepen; status
   **200** = in orde. **401** = de header klopt niet. **500** = kijk naar de tekst in
   het antwoord (bijv. een ontbrekende sleutel).

### Stap 4 — Campagne starten
1. Open een vacature → **Automatisch benaderen**.
2. Controleer de **zoekopdracht** (trefwoorden, functie, locatie opzoeken en aanvinken).
3. Pas de **uitnodigingstekst** (kort, max. 200 tekens) en het **bericht na acceptatie** aan als je wilt. Rechts/onder zie je een voorbeeld. De app
   controleert dat de bron (LinkedIn) en een afmeldoptie erin staan.
4. Klik **Keur goed en start**.
5. Wil je meteen zien of het werkt: klik **Nu één stap uitvoeren (test)**.

## Tips
- **Premium/Sales Navigator?** Zet dan in Supabase (tabel `settings`) `invite_note_max_chars` op 300 en
  `max_invite_notes_per_week` hoger (bijv. 100).
- **Week 1:** laat `max_invites_per_day` op 10. Daarna rustig ophogen tot max. 20.
- **Pauzeren** kan per vacature met de knop **Pauzeer**.
- Alles staat in het logboek (`activity_log`) en in de tijdlijn per kandidaat.
- Kandidaten die nog niet gereageerd hebben, zie je bij de vacature via **Toon alle**.
