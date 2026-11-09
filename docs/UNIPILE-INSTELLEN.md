# Unipile instellen (LinkedIn koppelen)

Alles in de browser, ±20 minuten. Gebruik tijdens het testen je **LinkedIn-testaccount**,
niet je eigen account.

## Stap 1 — Unipile-account
1. Ga naar https://www.unipile.com en maak een account aan. Unipile is een betaalde dienst;
   kijk op hun site naar de actuele prijs en proefperiode.
2. Log in op het Unipile-dashboard.

## Stap 2 — LinkedIn-testaccount koppelen
1. In het dashboard: **Accounts → Connect account → LinkedIn**.
2. Log in met je LinkedIn-**testaccount** en volg de stappen (eventueel een code uit je mail of app).
3. Het account verschijnt in de lijst als verbonden.

## Stap 3 — Twee waarden opzoeken
| Wat | Waar in Unipile |
|---|---|
| **API-key** | Bij de API-keys / Access tokens van je applicatie → nieuwe key maken. Kopieer hem meteen; **niet in de chat plakken**. De key moet bij dezelfde applicatie horen als het LinkedIn-account. |
| **Account-ID** | **Accounts** → je LinkedIn-account. Het ID **begint met `acc_`**, bijvoorbeeld `acc_123456789`. |

Een adres (DSN) is niet nodig: de app gebruikt altijd `https://api.unipile.com/v2`.

## Stap 4 — In Vercel zetten
Vercel → je project → **Settings → Environment Variables**:

| Name | Value |
|---|---|
| `UNIPILE_API_KEY` | de API-key |
| `UNIPILE_ACCOUNT_ID` | het account-ID (`acc_…`) |

Heb je eerder `UNIPILE_DSN` of `UNIPILE_LINKEDIN_API` ingevuld? Die mag je verwijderen
(ze zijn niet meer nodig). Laat je ze staan, dan is dat ook goed.

Daarna: **Deployments → ⋯ → Redeploy**.

## Stap 5 — Database bijwerken
Supabase → **SQL Editor** → plak `supabase/migrations/20261110000000_fase3_linkedin.sql` → **Run**.
(Heb je dit al gedaan, dan hoeft het niet opnieuw.)

## Goed om te weten
- **Gratis LinkedIn-account:** LinkedIn staat dan maar ±5 uitnodigingen *met bericht* per
  maand toe. Voor fase 6 (berichten versturen) is een betaald account (Premium / Sales
  Navigator) bijna noodzakelijk.
- **Zoeken:** een gewoon account geeft 10 resultaten per keer ("Meer resultaten" voor de
  volgende 10) en max. 1.000 per zoekopdracht. Filteren op jaren ervaring kan niet.
- **Importeren** gaat bewust langzaam: één profiel per 30–120 seconden, max. 80 per dag,
  alleen op werkdagen tussen 08:00 en 18:00. Laat de importpagina open staan.
- Profielbezoeken geven de persoon **geen** melding.
