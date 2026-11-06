# Inlogmail

**De standaardmail van Supabase werkt.** De inloglink werkt in elke browser
en op elk apparaat, dus je hoeft niets aan te passen. (De app vraagt de link
aan op een manier die niet aan één browser vastzit. De route wordt getest in
`scripts/e2e/login.mjs`.)

Er is één beperking: de ingebouwde mailserver van Supabase verstuurt
maximaal **2 mails per uur** voor het hele project. Met meerdere collega's
kom je daar snel aan, en dan zie je "Het maximum aantal inlogmails per uur is
bereikt". Hieronder staat hoe je dat oplost met Resend. Resend hebben we in
fase 7 toch nodig.

**Kosten:** Resend is gratis tot 3.000 mails per maand (100 per dag).

---

## Direct verder zonder Resend
- Klik maar **één keer** op "Stuur inloglink" en gebruik de link uit de mail.
- Na het inloggen blijf je lang ingelogd, dus je hebt niet elke dag een mail nodig.
- Limiet bereikt? Wacht een uur.

---

## Stap 1 — Resend-account en domein (±15 min + wachten op DNS)
1. Maak een account op https://resend.com (gratis).
2. Ga naar **Domains → Add Domain**, vul `cr8las.nl` in en kies regio **EU (Ireland)**.
3. Resend toont een paar DNS-records (TXT en MX). Die moeten erbij komen bij
   de partij waar `cr8las.nl` geregistreerd is (bijv. TransIP, Hostnet, Versio,
   of jullie IT-beheerder). Kun je daar zelf niet bij, stuur de records dan
   door naar wie het domein beheert.
4. Wacht tot Resend bij het domein **Verified** toont. Dat duurt meestal
   minuten, soms enkele uren.

## Stap 2 — API-key maken
1. Resend → **API Keys → Create API Key**.
   - Naam: `supabase-inlogmail`
   - Permission: **Sending access**
   - Domain: `cr8las.nl`
2. Kopieer de key (begint met `re_`). **Plak hem niet in de chat.** Je
   gebruikt hem alleen in de volgende stap.

## Stap 3 — Supabase koppelen
1. Supabase → **Authentication → Emails → SMTP Settings** → zet **Enable Custom SMTP** aan.
2. Vul in:

   | Veld | Waarde |
   |---|---|
   | Sender email | `Werkplaats@cr8las.nl` |
   | Sender name | `Cr8las Recruitment` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | je Resend API-key (`re_…`) |

3. Klik **Save changes**.
4. Supabase → **Authentication → Rate Limits** → zet **Rate limit for sending
   emails** op bijvoorbeeld `30` per uur → **Save**.

## Stap 4 (optioneel) — Nederlandse inlogmail
Met een eigen mailserver kun je de tekst van de mail aanpassen:
Supabase → **Authentication → Emails → Templates → Magic Link**.

- **Subject:** `Je inloglink voor Cr8las Recruitment`
- **Body:**

```html
<h2>Inloggen bij Cr8las Recruitment</h2>
<p>Klik op de link om in te loggen. De link werkt één keer en verloopt na een uur.</p>
<p><a href="{{ .ConfirmationURL }}">Inloggen</a></p>
<p>Heb je dit niet aangevraagd? Dan kun je deze mail negeren.</p>
```

Klik **Save changes**. Gebruik `{{ .ConfirmationURL }}` zoals hierboven, niet een
zelfgemaakte link.

## Testen
1. Open je Vercel-adres en vraag een inloglink aan.
2. De mail komt nu van `Werkplaats@cr8las.nl`.
3. In Resend → **Emails** zie je de verstuurde mail staan. Daar zie je ook of
   er iets misging.
