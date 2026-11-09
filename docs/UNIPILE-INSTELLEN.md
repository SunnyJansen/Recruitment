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
3. Het account verschijnt in de lijst met status **OK** / **Running**.

## Stap 3 — Drie waarden opzoeken
| Wat | Waar in Unipile |
|---|---|
| **DSN** | Bovenaan het dashboard, iets als `api8.unipile.com:13851` |
| **API-key** | **Access Tokens** (of API keys) → **Generate token**. Kopieer hem meteen; **niet in de chat plakken**. |
| **Account-ID** | **Accounts** → klik op je LinkedIn-account → het ID (een code van ±20 tekens) |

## Stap 4 — In Vercel zetten
Vercel → je project → **Settings → Environment Variables** → voeg toe:

| Name | Value |
|---|---|
| `UNIPILE_DSN` | de DSN, bijv. `api8.unipile.com:13851` |
| `UNIPILE_API_KEY` | de API-key |
| `UNIPILE_ACCOUNT_ID` | het account-ID |
| `UNIPILE_LINKEDIN_API` | `classic` |

Daarna: **Deployments → ⋯ → Redeploy**.

## Stap 5 — Database bijwerken
Supabase → **SQL Editor** → plak `supabase/migrations/20261110000000_fase3_linkedin.sql` → **Run**.

## Goed om te weten
- **Gratis LinkedIn-account:** LinkedIn staat dan maar ±5 uitnodigingen *met bericht* per
  maand toe. Voor fase 6 (berichten versturen) is een betaald account (Premium / Sales
  Navigator) bijna noodzakelijk.
- **Zoeken:** een gewoon account geeft 10 resultaten per keer ("Meer resultaten" voor de
  volgende 10) en max. 1.000 per zoekopdracht. Filteren op jaren ervaring kan niet.
- **Importeren** gaat bewust langzaam: één profiel per 30–120 seconden, max. 80 per dag,
  alleen op werkdagen tussen 08:00 en 18:00. Laat de importpagina open staan.
