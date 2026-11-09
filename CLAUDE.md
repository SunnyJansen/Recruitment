# CLAUDE.md — AI Recruitment Systeem

Dit bestand leest Claude Code automatisch bij elke sessie. Het beschrijft wat we bouwen, hoe, en welke regels gelden.

## Wat we bouwen
Een AI-recruitmentsysteem dat:
1. Kandidaten zoekt op LinkedIn via **Unipile**
2. Ze opslaat in een eigen **kandidatendatabase** (zonder dubbelen)
3. Met **Claude (Anthropic API)** een matchscore + persoonlijk bericht maakt
4. Na **menselijke goedkeuring** berichten verstuurt (LinkedIn via Unipile, e-mail via Resend)
5. Reacties automatisch verwerkt (Unipile-webhooks) en **opvolging** inplant
6. Alles toont in een **dashboard** (pipeline per vacature)

## Eigenaar
Sunny Jansen (Projectmanager, **Cr8las**) — geen fulltime developer. Leg keuzes kort uit in het Nederlands, werk in kleine stappen, en laat na elke fase zien hoe ik het kan testen.

## Tech stack
- **Next.js (App Router) + TypeScript** — frontend + API-routes
- **Supabase** (Postgres + Auth) — database en login
- **Tailwind CSS + shadcn/ui** — interface, in huisstijl **Sunny Apple** (dashboardstijl, donker standaard). Zie `docs/DESIGN.md`
- **Unipile API** — LinkedIn zoeken, profielen, uitnodigingen, berichten, webhooks
- **Anthropic API** (`@anthropic-ai/sdk`) — matching en berichten schrijven. Model via env-var `ANTHROPIC_MODEL`
- **Resend** — e-mail versturen
- **Vercel** — hosting (nodig voor publieke webhook-URL). Gratis plan: Vercel Cron maar 1×/dag, dus de wachtrij wordt aangeroepen door een externe cron-dienst met `CRON_SECRET`

**Next.js 16 let op:** `proxy.ts` i.p.v. `middleware.ts`; `cacheComponents` staat aan, dus alles wat cookies/sessie/searchParams leest moet binnen `<Suspense>` (of een `loading.tsx`) staan. Lees bij twijfel `node_modules/next/dist/docs/`.

## Harde regels (niet van afwijken)
1. **Geen bericht gaat weg zonder goedkeuring.** AI maakt concepten met status `draft`; alleen een gebruiker zet ze op `approved`. Verzenden gebeurt alleen bij `approved`.
2. **LinkedIn-limieten afdwingen in code** (instelbaar in tabel `settings`):
   - max. 20 connectieverzoeken per dag / 100 per week per account
   - max. 50 berichten per dag
   - max. 80 profielbezoeken per dag
   - willekeurige wachttijd van 30–120 sec tussen acties (queue, geen bulk)
   - werk alleen op werkdagen tussen 08:00 en 18:00 (Europe/Amsterdam)
3. **AVG:**
   - elk eerste bericht vermeldt bron ("Ik vond je profiel op LinkedIn") en een afmeldoptie
   - afmelding/“geen interesse” → status `opted_out`, nooit meer benaderen
   - kandidaten zonder reactie na `retention_days` (standaard 180) automatisch anonimiseren
   - log elke actie in `activity_log`
4. **AI beslist niet zelf over kandidaten.** Matchscore is advies; afwijzen/doorzetten doet een mens (EU AI Act: recruitment-AI = hoog risico).
5. **Geheimen alleen in Vercel Environment Variables (of `.env.local`)**, nooit in code of git.
6. **Unipile-endpoints altijd verifiëren** in de actuele docs (https://developer.unipile.com) voordat je ze implementeert — niet gokken. Al geverifieerd: zie `docs/UNIPILE.md` (zoeken, locatie-ID's, profiel, limieten). De omgeving `recruitment` staat developer.unipile.com toe (ophalen met `curl` via de proxy; WebFetch kan het soms niet).

## Besluiten
Alle antwoorden op de startvragen (doelgroep lassers NL + Zuid-Afrika, taal NL/EN per kandidaat, opvolgschema, bewaartermijnen, enz.) staan in `docs/BESLUITEN.md`. Die gaan voor op aannames.

## Datamodel (Supabase)
Volledig schema: `supabase/migrations/`. Types: `lib/db/types.ts` (met de hand gelijk houden). Hieronder de kern; extra velden staan in de migratie.
- `vacancies` — id, title, description, location, requirements (jsonb), status, created_at
- `candidates` — id, linkedin_provider_id (uniek), linkedin_url, full_name, headline, location, current_company, experience (jsonb), skills (text[]), email, phone, source, status, opted_out_at, created_at, updated_at
- `candidate_vacancy` — candidate_id, vacancy_id, match_score (0–100), match_reason, stage (`new`|`contacted`|`replied`|`interview`|`placed`|`rejected`|`opted_out`)
- `messages` — id, candidate_id, vacancy_id, channel (`linkedin_invite`|`linkedin_message`|`email`), direction (`out`|`in`), body, status (`draft`|`approved`|`queued`|`sent`|`failed`|`received`), unipile_chat_id, scheduled_at, sent_at
- `follow_ups` — id, candidate_id, due_at, step (1,2,3), done
- `searches` — id, vacancy_id, query (jsonb), api_type (`classic`|`sales_navigator`|`recruiter`), results_count, created_at
- `activity_log` — id, actor (user/system), action, entity, entity_id, details (jsonb), created_at
- `settings` — key, value (limieten, retention_days, follow-up dagen, werktijden)
- `do_not_contact` — hash (sha256 van LinkedIn-id/e-mail), kind — "nooit meer benaderen", ook na anonimiseren

**Database bewaakt de harde regels zelf (triggers):** uitgaande berichten starten als `draft`; alleen een ingelogde gebruiker kan `approved` zetten; `queued`/`sent` alleen na goedkeuring; geen berichten naar `opted_out`/`anonymized`; afmelden zet koppelingen op `opted_out`, annuleert concepten en opvolging en vult `do_not_contact`. `activity_log` kan niet gewijzigd of gewist worden. Test: `npm run test:db`.

## Mappenstructuur
```
/app            pagina's + /app/api routes (webhooks, cron)
/lib/unipile    Unipile client (client.ts, linkedin.ts: search/getProfile; map.ts: puur, getest)
/lib/ai         Claude prompts (match, writeMessage, classifyReply)
/lib/queue      verzendwachtrij + rate limiting
/lib/db         Supabase client + types
/supabase       migrations (SQL)
/docs           PLAN.md en notities
```

## Werkwijze
- **Sunny installeert niets lokaal.** Testen gaat via de Vercel-deployment (automatisch na elke push) en GitHub Actions (`.github/workflows/controle.yml`: test:db, test:login, lint, build, test:e2e). Testinstructies dus altijd in browser-stappen: Vercel-adres, Supabase-dashboard, GitHub Actions. Nieuwe env-vars → in Vercel toevoegen + Redeploy. Database-wijzigingen → nieuw migratiebestand dat Sunny in de Supabase SQL Editor plakt.
- **Testmodus (`SITE_PASSWORD` gezet):** één teamwachtwoord, cookie `cr8_site` (HMAC), server gebruikt de service-key (`lib/db/server.ts`), `actor_id` in logs is dan null. Goedkeuren van berichten werkt in deze modus NIET (trigger eist `auth.uid()`), dus vóór fase 5 moet de gewone login terug. Bouw nieuwe features zo dat ze in beide modi werken (gebruik `createClient()`/`getCurrentUser()` uit `lib/db/server.ts`).
- **Inloggen:** de link wordt aangevraagd met de implicit-flow (`lib/auth/request-link.ts`) zodat hij in elke browser werkt met de standaard Supabase-mail (templates aanpassen kan pas met eigen SMTP). Landing: `/auth/complete`. Niet terugzetten naar PKCE; `npm run test:e2e` bewaakt dit.
- **Browsertests:** `scripts/e2e/*.mjs` draaien tegen `scripts/e2e/fake-supabase.mjs`: een nep-PostgREST op PGlite met álle migraties (echte triggers en constraints). Ondersteunt geen embedding (`select=a,b(c)`): haal gerelateerde rijen apart op met `.in()`. Next.js 16 houdt vorige pagina's verborgen in de DOM (Activity), dus in tests alleen zichtbare elementen checken (`seen()`).
- **LinkedIn-acties (fase 3+):** elke automatische actie gaat via `linkedin_take_slot()` in de database (willekeurige pauze, dag-/weeklimiet, atomair) + `checkWorkingHours()` (`lib/queue/schedule.ts`, incl. NL-feestdagen). Tellen in `linkedin_actions`. Import: `import_queue` + `processNextImport()` (`lib/queue/import.ts`), nu aangedreven door de open importpagina; fase 6-cron kan dezelfde functie aanroepen. Classic zoeken: max. 10 per pagina. E-mail/telefoon uit LinkedIn nooit overnemen.
- Volg `docs/PLAN.md` fase voor fase. Begin pas aan een volgende fase als de huidige werkt.
- Schrijf per module een kleine test of testscript.
- Gebruik **Unipile sandbox/testaccount** of een LinkedIn-account dat gemist kan worden tijdens ontwikkelen.
- Commit na elke werkende stap met een duidelijke Nederlandse commit-message.
- UI-teksten in het Nederlands.
