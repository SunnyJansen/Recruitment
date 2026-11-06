# Inlogmail instellen

## Deel A — Inloglink die altijd werkt (verplicht, 2 minuten)

De standaardlink van Supabase werkt alleen in dezelfde browser waar je hem
aanvroeg, en een virusscanner in je mailprogramma kan hem al "opgebruiken"
voordat jij klikt. Met deze template opent de link een pagina met een knop
**Log in**. Dat werkt in elke browser en op elk apparaat, ook vanaf je telefoon.

1. Controleer eerst in Supabase → **Authentication → URL Configuration** dat de
   **Site URL** je Vercel-adres is, **zonder `/` aan het eind**, bijvoorbeeld
   `https://recruitment-xxxx.vercel.app`.
2. Ga naar Supabase → **Authentication → Emails → Templates → Magic Link**.
3. **Subject:** `Je inloglink voor Cr8las Recruitment`
4. Vervang de hele **Body** door:

```html
<h2>Inloggen bij Cr8las Recruitment</h2>
<p>Klik op de link en daarna op de knop <strong>Log in</strong>. De link werkt één keer en verloopt na een uur.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Inloggen</a></p>
<p>Heb je dit niet aangevraagd? Dan kun je deze mail negeren.</p>
```

5. Klik **Save changes**.
6. Test: vraag een nieuwe link aan, klik op **Inloggen** in de mail en daarna op **Log in**.

---

## Deel B — Inlogmails zonder limiet: Supabase laten mailen via Resend

**Waarom:** de ingebouwde mailserver van Supabase is alleen voor uitproberen.
Hij verstuurt maximaal **2 mails per uur** voor het hele project. Met
meerdere collega's kom je daar snel aan, en dan zie je "Het maximum aantal
inlogmails per uur is bereikt". Resend hebben we in fase 7 toch nodig, dus we
zetten het nu al in.

**Kosten:** Resend is gratis tot 3.000 mails per maand (100 per dag).

---

## Direct verder zonder Resend
- Wacht een uur. Daarna kun je weer 2 inlogmails versturen.
- Klik maar **één keer** op "Stuur inloglink" en gebruik de link uit de mail.
- Na het inloggen blijf je lang ingelogd, dus je hebt niet elke dag een mail nodig.

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

## Testen
1. Open je Vercel-adres en vraag een inloglink aan.
2. De mail komt nu van `Werkplaats@cr8las.nl`.
3. In Resend → **Emails** zie je de verstuurde mail staan. Daar zie je ook of
   er iets misging.
