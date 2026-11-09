# Unipile — geverifieerde API-informatie

Gecontroleerd op **9 november 2026** in de officiële documentatie
(developer.unipile.com: `docs/linkedin-search`,
`reference/linkedincontroller_search`,
`reference/linkedincontroller_getsearchparameterslist`,
`reference/userscontroller_getprofilebyidentifier`,
`docs/provider-limits-and-restrictions`) en de officiële `unipile-node-sdk@1.9.3`.
Controleer opnieuw bij twijfel of als een endpoint onverwacht reageert (harde regel 6).

## Algemeen
- Basis-URL: `https://{DSN}/api/v1/...`. De DSN staat in het Unipile-dashboard, bijv. `api8.unipile.com:13851`.
- Header `X-API-KEY: <key>`, plus `accept: application/json`.
- Bijna elk endpoint wil `account_id` (id van het gekoppelde LinkedIn-account) als query-parameter.

## Zoeken naar personen (classic)
`POST /api/v1/linkedin/search?account_id=…&limit=…&cursor=…`
- `limit`: **classic personen: max. 10 per pagina**; Sales Navigator/Recruiter: max. 100.
- `cursor` (query-parameter): uit het vorige antwoord, voor de volgende pagina.
- Body (classic, personen), verplicht: `api: "classic"`, `category: "people"`. Optioneel:
  - `keywords` (string)
  - `advanced_keywords`: `{ first_name, last_name, title, company, school }` (strings)
  - `location`: lijst van ID's als string (`["102890719"]`), via het parameters-endpoint
  - `industry`, `company`, `past_company`, `school`, `service`: lijsten van ID's
  - `network_distance`: `[1, 2, 3]`
  - `profile_language`: ISO 639-1 (`["nl"]`)
  - **Geen** filter op aantal jaren ervaring in classic (wel in Sales Navigator/Recruiter).
- Antwoord: `{ object: "LinkedinSearch", items: [...], paging: { start, page_count, total_count }, cursor }`
- Persoon in `items`: `type: "PEOPLE"`, `id` (= provider_id), `public_identifier`,
  `public_profile_url`, `profile_url`, `name`, `first_name`, `last_name`, `headline`,
  `location`, `industry`, `network_distance` (`SELF`/`DISTANCE_1`/`DISTANCE_2`/`DISTANCE_3`/`OUT_OF_NETWORK`),
  `pending_invitation`, `profile_picture_url`.
- Foutcodes: 400 ongeldige parameters, 401 account losgekoppeld, 403 geen rechten,
  404, 500 provider_error, 503 no_client_session, 504.

## Locatie-ID's en andere filters opzoeken
`GET /api/v1/linkedin/search/parameters?account_id=…&type=LOCATION&keywords=limburg&limit=10`
- `type`: o.a. `LOCATION`, `REGION`, `COMPANY`, `SCHOOL`, `INDUSTRY`, `SKILL`, `JOB_TITLE`, `LANGUAGE`.
- `limit` 1–100 (standaard 10). `service`: `CLASSIC` (standaard), `RECRUITER`, `SALES_NAVIGATOR`.
- Antwoord: `{ object: "LinkedinSearchParametersList", items: [{ id, title }], paging }`.

## Profiel ophalen (= profielbezoek)
`GET /api/v1/users/{identifier}?account_id=…&linkedin_sections=…&notify=false`
- `identifier`: provider_id of public_identifier.
- `linkedin_sections`: o.a. `*_preview` (alle secties, eerste regels; aanbevolen bij veel
  bezoeken), `*` (alles, zwaar), of los: `experience`, `skills`, `about`, …
- `notify`: of de persoon een melding van het bezoek krijgt. Standaard `false`.
- Antwoord (`object: "UserProfile"`): `provider_id`, `public_identifier`, `public_profile_url`,
  `first_name`, `last_name`, `headline`, `location`, `summary`,
  `work_experience[{ position, company, location, start, end }]`,
  `skills[{ name, endorsement_count }]`, `languages`, `education`, `network_distance`,
  `is_relationship`, `contact_info{ emails, phones }`. **E-mail/telefoon nemen we niet over**
  (besluit: e-mail alleen als de recruiter het zelf invult).

## Limieten volgens Unipile (per LinkedIn-account)
- **Uitnodigingen:** betaald account 80–100 per dag / ±200 per week. **Gratis account: ±5 per
  maand mét bericht** (200 tekens), ±150 per week zonder bericht. Over de limiet:
  fout `422 / cannot_resend_yet`.
- **Profielen ophalen:** ±100 per dag (aanbeveling). Wij: `max_profile_views_per_day` (80).
- **Zoeken:** max. 1.000 resultaten per zoekopdracht (classic). Aanbeveling: max. 1.000
  opgehaalde resultaatregels per dag. Wij: `max_search_results_per_day`.
- Overige acties: standaard max. 100 per dag, willekeurig gespreid.
- Geaccepteerde uitnodigingen: gebruik de `new_relation`-webhook, niet pollen (fase 7).
