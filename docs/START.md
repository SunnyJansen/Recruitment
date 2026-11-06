# Zo start je

1. Maak een nieuwe, lege map, bijv. `ai-recruitment`.
2. Zet hierin: `CLAUDE.md`, `.env.example` en de map `docs/` met `PLAN.md`.
3. Doe **Fase 0** uit `docs/PLAN.md` (accounts + keys) en vul `.env.local` in.
4. Open een terminal in die map en typ: `claude`
5. Plak de eerste prompt hieronder.

---

## Prompt 1 — kick-off
```
Lees CLAUDE.md en docs/PLAN.md. Vat in 5 zinnen samen wat we bouwen en
stel eventuele vragen voordat je begint. Start daarna met Fase 1.
Werk in kleine stappen, leg in het Nederlands uit wat je doet,
en vertel me aan het eind precies hoe ik Fase 1 test.
```

## Volgende fases
```
Fase [X] uit docs/PLAN.md. Check eerst de actuele Unipile-docs
(developer.unipile.com) voor de endpoints die je nodig hebt.
Houd je aan de harde regels in CLAUDE.md. Sluit af met testinstructies.
```

## Handige prompts
- **Iets werkt niet:** `Ik krijg deze fout: [plak fout]. Zoek de oorzaak en los het op.`
- **Uitleg:** `Leg uit hoe de verzendwachtrij werkt, in simpele woorden.`
- **Controle:** `Controleer of alle harde regels uit CLAUDE.md echt in de code worden afgedwongen.`
- **Tussendoor plannen:** druk `Shift+Tab` voor plan-modus bij grotere wijzigingen.

## Tips
- Werk met een LinkedIn-testaccount tot Fase 9.
- Laat Claude Code na elke fase committen (`git`), zodat je altijd terug kunt.
- Begin live klein: 10 uitnodigingen per dag, daarna rustig opbouwen.
