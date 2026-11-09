# Unipile — geverifieerde API-informatie (API v2)

Gecontroleerd op **9 november 2026** in de officiële documentatie
(developer.unipile.com/v2.0: `docs/api-usage`, `docs/error-responses`,
`docs/migration-linkedin-api`, `docs/migration-users-api`,
`reference/performclassicpeoplesearch`, `reference/getclassicsearchparameters`,
`reference/getuserprofile`, `reference/rate-limit`; limieten:
`docs/provider-limits-and-restrictions`). Controleer opnieuw bij twijfel (harde regel 6).
Handig: elke docs-pagina is als markdown op te halen door `.md` achter de URL te zetten;
index: `https://developer.unipile.com/v2.0/llms.txt`.

> **v1 vs v2:** nieuwe Unipile-accounts gebruiken API v2 (account-ID's beginnen met
> `acc_`). De app gebruikt alleen v2. v1 (`https://{DSN}/api/v1/...?account_id=...`)
> wordt niet meer ondersteund. Een v1-adres met een `acc_`-account geeft de fout
> `params/account_id : must match pattern "^acc_(.*)$"`.

## Algemeen
- Basis-URL: `https://api.unipile.com/v2` (alleen HTTPS). Geen DSN meer.
- Alle LinkedIn-routes: `https://api.unipile.com/v2/{account_id}/...`, met `account_id`
  = `acc_…` **in het pad** (niet meer als query).
- Header `X-API-KEY: <key>`. De key moet bij dezelfde Unipile-applicatie horen als het account.
- Fouten (RFC 7807): `{ object: "Error", type, status, title, detail, req_id }`.

## Zoeken naar personen (classic)
`POST /v2/{account_id}/linkedin/search/people`
- Body (alle optioneel, geen extra velden toegestaan):
  - `keywords` (string)
  - `advanced_keywords`: `{ first_name, last_name, title, company, school }`
  - `location`: lijst van ID's (strings) via het parameters-endpoint
  - `current_company`, `past_company`, `school`, `industry`, `service`: lijsten van ID's
  - `network_distance`: `[1, 2, 3]`
  - `profile_language`: ISO 639-1 (`["nl"]`)
  - **Niet meer:** `api`, `category` (v1). **Geen** filter op jaren ervaring in classic.
- Query: `cursor` = `next_cursor` van de vorige pagina. Classic: 10 personen per pagina.
- Antwoord: `{ data: [PeopleSearchResult], total_count, next_cursor }`
- `PeopleSearchResult`: `id` (= provider-id, gebruiken voor profiel), `display_name`,
  `public_identifier`, `profile_url`, `headline`, `location`, `network_distance`
  (`SELF`/`FIRST_DEGREE`/`SECOND_DEGREE`/`THIRD_DEGREE`/`OUT_OF_NETWORK`), `industry`,
  `is_premium`, `is_open_profile`, `product: "classic"`.

## Locatie-ID's en andere filters opzoeken
`GET /v2/{account_id}/linkedin/search/parameters?type=LOCATION&keywords=limburg&limit=10`
- `type` (verplicht): `LOCATION`, `COMPANY`, `RELATION`, `PEOPLE`, `SCHOOL`, `INDUSTRY`,
  `SERVICE`, `JOB_FUNCTION`, `JOB_TITLE`, `EMPLOYMENT_TYPE`, `SKILL`.
- `keywords` (verplicht), `limit` 1–100 (standaard 10), `offset`.
- Antwoord: `{ data: [{ object: "SearchParameter", id, name }] }`.

## Profiel ophalen (= profielbezoek)
`GET /v2/{account_id}/users/{user_id}?with_sections=linkedin_*_preview&variant=linkedin_classic`
- `user_id`: het `id` uit de zoekresultaten.
- `with_sections`: o.a. `linkedin_*` (alles, zwaar), `linkedin_*_preview` (eerste regels,
  aanbevolen bij veel bezoeken), of los: `linkedin_experience`, `linkedin_skills`, …
- **Geen melding aan de persoon:** in v2 is daar een aparte "Notify profile visit"-route
  voor (`specifics.notify_visit_token`). Die roepen wij nooit aan.
- Antwoord (`object: "UserProfile"`): `id`, `display_name`, `first_name`, `last_name`,
  `public_identifier`, `profile_url`, `description` (= kopregel), `bio`, `location`,
  `emails`, `phone_numbers`, `specifics` met o.a. `experience[{ company: { name },
  job_title, started_on, ended_on, location }]` (datums `MM/DD/YYYY`), `skills[{ name }]`,
  `network_distance`. **E-mail/telefoon nemen we niet over** (besluit).

## Benaderen (uitnodigen, connecties, berichten, reacties)
Geverifieerd in `reference/createrelationrequest`, `getuserrelations`, `startchatfrominbox`,
`getchatslist`, `getmessageslist` en `docs/linkedin-send-messages` (v2, 11 nov 2026).
- **Uitnodiging:** `POST /v2/{acc}/users/me/relation-requests` body `{ user_id, message? }` → 201
  `{ object: "RelationRequest", type: "sent", id }`. Wij sturen de goedgekeurde uitnodigingstekst mee zolang het weektegoed het toelaat; anders zonder `message`.
- **Connecties:** `GET /v2/{acc}/users/me/relations?limit=…&cursor=…` → `{ data: [{ id, created_at,
  user: { id, public_identifier, display_name, profile_url } }], next_cursor }`. Bladeren alleen met `cursor`.
  Unipile raadt aan dit maar een paar keer per dag op willekeurige momenten te doen.
- **Eerste bericht:** `POST /v2/{acc}/inboxes/CLASSIC_PRIMARY/chats/send` body `{ users_ids: "<user_id>",
  text }` → `{ chat_id, message_id }`. `users_ids` als **enkele string** = 1-op-1 (een lijst = groep).
  Alleen de primary inbox mag een gesprek starten; zonder connectie kan het alleen met InMail.
- **Gesprekken:** `GET /v2/{acc}/chats?type=1to1&limit=…` → `{ data: [{ id, user_id, type, is_1to1,
  last_message_timestamp }] }`, nieuwste laatste bericht eerst. Let op: `after` filtert op de
  **aanmaakdatum** van het gesprek, niet op het laatste bericht.
- **Berichten:** `GET /v2/{acc}/chats/{chat_id}/messages?after=…` → `{ data: [{ id, text, sender_id,
  is_sender, timestamp, is_event, is_deleted }] }`, nieuwste eerst. `is_sender: false` = van de kandidaat.
- Advies Unipile: minstens 10–20 seconden tussen berichten (wij: 30–120 s).

## Foutmeldingen v2 (selectie)
| status | type | betekenis |
|---|---|---|
| 400 | `api/invalid_parameters` | verkeerde parameters (zie `detail`) |
| 401 | `api/missing_authorization` / `api/expired_authorization` | API-key ontbreekt/verlopen |
| 401 | `provider/invalid_authorization` | LinkedIn-account opnieuw koppelen |
| 403 | `api/inactive_subscription` | Unipile-abonnement niet actief |
| 403 | `api/insufficient_permissions` | key hoort niet bij deze applicatie |
| 404 | `provider/resource_not_found` | profiel bestaat niet (meer) |
| 404 | `api/resource_not_found` | account/route onbekend |
| 422 | `provider/unprocessable_entity` | LinkedIn kan het niet verwerken |
| 429 | `api/too_many_requests` / `provider/too_many_requests` | rustiger aan; header `retry-after` |
| 5xx | `api/internal_error`, `provider/server_error`, `provider/timeout` | tijdelijk |

## Limieten volgens Unipile (per LinkedIn-account)
- **Uitnodigingen (v2-docs, 12 nov 2026):** betaald account 80–100 per dag / ±200 per week, tekst max.
  300 tekens. **Gratis account met wat geschiedenis: ±15 per week mét tekst (max. 200 tekens)**, ±150 per
  week zonder tekst. Nieuwe/inactieve accounts: laag beginnen; accounts met < ~150 connecties kunnen er
  minder sturen. (De oude v1-pagina noemde "±5 per maand mét bericht"; de v2-pagina gaat voor.)
- **Profielen ophalen:** ±100 per dag (aanbeveling). Wij: `max_profile_views_per_day` (80).
- **Zoeken:** max. 1.000 resultaten per zoekopdracht (classic). Aanbeveling: max. 1.000
  opgehaalde resultaatregels per dag. Wij: `max_search_results_per_day`.
- Daarnaast heeft Unipile v2 eigen rate limits per route (headers `x-ratelimit-*`, bij 429 `retry-after`).
- Overige acties: standaard max. 100 per dag, willekeurig gespreid.
