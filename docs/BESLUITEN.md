# Besluiten

Antwoorden van Sunny Jansen op de startvragen (6 november 2026). Bij twijfel gaat dit document voor op aannames.

## Organisatie
- **Bedrijf:** Cr8las, een bedrijf dat voor zichzelf werft (geen bureau, dus geen klantveld).
- **Afzender:** Sunny Jansen, Projectmanager.
- **Inloggen (tijdelijk):** testmodus met één teamwachtwoord (`SITE_PASSWORD`), omdat de inlogmail nog niet goed werkte. De gewone login met inlogmail komt later terug, uiterlijk vóór fase 5.
- **Gebruikers:** meerdere collega's. Alleen e-mailadressen die een beheerder in Supabase toevoegt kunnen inloggen.
- **Huisstijl:** design systeem *Sunny Apple*, dashboardstijl (zie `docs/DESIGN.md`).

## Hosting en kosten
- **Niets lokaal installeren.** Testen gaat via Vercel (automatische deployment na elke push) en GitHub Actions (tests). Sleutels staan in Vercel → Environment Variables.
- **Vercel gratis (Hobby):** cron draait daar maar 1× per dag. Voor de verzendwachtrij (fase 6) gebruiken we daarom een gratis externe cron-dienst (bijv. cron-job.org) die een beveiligde URL aanroept met `CRON_SECRET`.
- **Supabase gratis:** prima tijdens het bouwen (pauzeert na een week zonder activiteit).

## LinkedIn / Unipile
- Account: **classic** LinkedIn (`UNIPILE_LINKEDIN_API=classic`).
- Er is een LinkedIn-testaccount voor het ontwikkelen.
- Niet-geaccepteerde uitnodiging na **21 dagen** intrekken.

## Vacatures en kandidaten
- Functies: **lassers** in **Nederland en Zuid-Afrika**.
- Vacature-eisen (voorstel, fase 2): verplichte skills, gewenste skills, lasprocessen (TIG/MIG/MAG/elektrode/…), materialen (staal/RVS/aluminium), certificaten, min. jaren ervaring, opleiding, talen, max. reisafstand, salarisindicatie.
- E-mail alleen als de recruiter het adres zelf invult.

## AI
- Model: Claude Sonnet 5.5 (`ANTHROPIC_MODEL=claude-sonnet-5-5`), instelbaar.
- Taal: **Nederlands voor Nederlanders, Engels voor kandidaten buiten Nederland** (veld `candidates.language`).
- Toon standaard informeel ("je"), per vacature aan te passen.
- Nog geen voorbeeldberichten.
- AI maakt alleen concepten voor kandidaten die de recruiter aanvinkt.

## Verzenden en limieten
- Standaardlimieten uit CLAUDE.md. **Week 1: max. 10 uitnodigingen per dag.**
- Nederlandse feestdagen gelden als niet-werkdag.
- Afmeldzin LinkedIn: "Geen interesse? Laat het weten, dan benader ik je niet meer." E-mail krijgt daarnaast een afmeldlink.
- E-mail vanaf **Werkplaats@cr8las.nl** (domein verifiëren in Resend).

## Reacties en opvolging
- Opvolging na **4, 7 en 14 werkdagen**, daarna stoppen.
- Bij een reactie: melding in het dashboard **en** een e-mail.
- Alleen "afmelden" verwerkt het systeem automatisch. Twijfelgevallen krijgen de categorie `review`.

## AVG
- Anonimiseren na **180 dagen** zonder reactie. Wie wél reageerde: **365 dagen** na het laatste contact.
- Anonimiseren, niet verwijderen (statistieken blijven kloppen).
- Afgemelde kandidaten: alleen een **sha256-hash** van LinkedIn-id/e-mail op `do_not_contact`.
- Privacyverklaring bestaat nog niet. Claude maakt een concept in fase 9, dat juridisch gecontroleerd moet worden.

## Dashboard
- Cijfers: benaderd, responsratio, acceptatieratio per vacature en per week. Meer is niet nodig.

## Automatisch benaderen (11 november 2026)
- Het systeem benadert kandidaten **automatisch en elke werkdag**; Sunny ziet een kandidaat pas op het dashboard als die reageert.
- **Goedkeuring:** per vacature één keer de berichttekst (NL + EN, met invulvelden) en de zoekopdracht. Geen goedkeuring per bericht. De database controleert dat elk bericht exact die tekst is.
- **Wie:** iedereen uit de door Sunny ingestelde zoekopdracht (geen AI-selectie), behalve wie al bekend, eerder benaderd of afgemeld is.
- **LinkedIn-account:** gratis → uitnodiging **zonder tekst**; na acceptatie volgt het goedgekeurde bericht.
- Reactie met "geen interesse"/"stop" e.d. → direct afgemeld (regel 3).
- Uitvoering via cron-job.org elke 5 minuten (Vercel Hobby heeft maar 1 cron per dag).
