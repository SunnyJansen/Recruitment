# Huisstijl: Sunny Apple (dashboardstijl)

Bron: het design systeem "Sunny Apple" (claude.ai artifact). De tokens staan als CSS-variabelen in
`app/globals.css`, met **donker als standaard** en licht onder `[data-theme="light"]`.

## Tailwind-namen

| Sunny Apple-token | Tailwind-class | Gebruik |
|---|---|---|
| `app-background` + gloed | `app-background` (utility) | achtergrond van de pagina |
| `surface` / `surface-border` | `bg-surface`, `border-surface-border` | panelen |
| `surface-raised` | `bg-surface-raised` | geselecteerde rij, uitgelicht cijfer, lege toestand |
| `surface-solid` | `bg-surface-solid` | dialogen |
| `text-strong` | `text-foreground` | titels, waarden |
| `text-muted` | `text-muted-foreground` | labels, metadata |
| `accent` | `bg-primary` | alleen de hoofdactie |
| `accent-text` / `accent-tint` | `text-accent-text`, `bg-accent-tint` | blauwe tekst/tint |
| `success` / `danger-text` | `text-success`, `text-danger-text` | status |

Typografie: `text-app-title` (20), `text-panel-title` (22), `text-band-title` (19), `text-stat-value` (24),
`text-field-label` (11 hoofdletters), `text-app-body` (14), `text-app-meta` (12).

Radius: `rounded-field` (10), `rounded-tile` (14), `rounded-surface` (20), `rounded-full` (capsule-knoppen).

## Componenten (`components/ui`)
- **Button**: `default` (hoofdactie, max. 1–2 per scherm), `bordered` (standaard), `destructive` (altijd als laatste), `tinted`, `borderless`.
- **Input** (38 hoog), **Label** (hoofdletters), **Badge** (`blue`/`green`/`red`/`gray`), **Panel**, **StatGroup**, **NavTabs**.

## Statustonen (altijd dezelfde)
| Status | Badge |
|---|---|
| Concept / nieuw | `gray` |
| Goedgekeurd / verstuurd / benaderd | `blue` |
| Gereageerd / geplaatst / in orde | `green` |
| Mislukt / afgewezen / afgemeld | `red` |

## Teksten
Zinsnotatie ("Bewaar als concept"), knoppen zijn werkwoorden, "je" en geen emoji.

## shadcn/ui
`components.json` staat klaar. Met `npx shadcn@latest add <component>` toegevoegde componenten
gebruiken automatisch de Sunny Apple-kleuren, omdat de shadcn-variabelen (`primary`, `muted`, …)
naar de Sunny Apple-tokens wijzen. Controleer wel de hoogte en radius tegen deze tabel.
