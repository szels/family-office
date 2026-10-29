# Depot

Eine kleine Single-Page-App, um ein Aktien-/ETF-Depot zu erfassen und die
Wertentwicklung grafisch zu verfolgen. Alle Daten (Transaktionen,
Wertpapiere, API-Key, Kurs-Cache) bleiben ausschließlich im `localStorage`
des Browsers — es gibt keinen eigenen Server.

Design und Entscheidungen im Detail:
[`docs/superpowers/specs/2026-10-29-portfolio-spa-design.md`](docs/superpowers/specs/2026-10-29-portfolio-spa-design.md).

## Kurse

Kursdaten kommen von [Alpha Vantage](https://www.alphavantage.co/support/#api-key)
(kostenloser API-Key). Der Key wird unter „Einstellungen“ eingetragen und
bleibt lokal im Browser. Die kostenlose Stufe erlaubt 25 Anfragen pro Tag;
die App cacht Kurse deshalb pro Tag und Symbol und zeigt bei Erreichen des
Limits die zuletzt bekannten Kurse weiter an.

Symbole folgen Alpha Vantages Notation für Xetra, z. B. `SAP.DEX` oder
`EUNL.DEX` (iShares Core MSCI World).

## Entwicklung

```bash
npm install
npm run dev      # Dev-Server
npm test         # Vitest, einmalig
npm run build    # Typecheck + Produktions-Build nach dist/
npm run preview  # dist/ lokal ansehen
npm run lint      # oxlint
```

## Deployment

Ein Push auf `main` baut und veröffentlicht die App automatisch auf
GitHub Pages (`.github/workflows/deploy.yml`). Einmalig in den
Repository-Einstellungen unter **Settings → Pages** als Quelle
**GitHub Actions** auswählen.
