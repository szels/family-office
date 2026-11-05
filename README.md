# Depot

Eine kleine Single-Page-App, um ein Aktien-/ETF-Depot zu erfassen und die
Wertentwicklung grafisch zu verfolgen. Alle Daten (Transaktionen,
Wertpapiere, API-Key, Kurs-Cache) bleiben ausschließlich im `localStorage`
des Browsers — es gibt keinen eigenen Server.

Design und Entscheidungen im Detail:
[`docs/superpowers/specs/2026-10-29-portfolio-spa-design.md`](docs/superpowers/specs/2026-10-29-portfolio-spa-design.md).

## Kurse

Aktien und ETFs laden **ohne API-Key** als **Tages-Schlusskurse in EUR** von
[onvista.de](https://www.onvista.de) (Xetra). Das ist eine undokumentierte,
aber frei und mit CORS nutzbare Schnittstelle ohne festes Tageslimit. Die App
holt den Verlauf ab einem Jahr vor dem ersten Kauf bzw. der Aufnahme in die
Watchlist und cacht ihn pro Tag und Symbol im Browser.

Als **Ersatzquelle** dient [Alpha Vantage](https://www.alphavantage.co/support/#api-key)
(kostenloser API-Key unter „Einstellungen“, optional): Wenn onvista ein
Symbol nicht kennt oder nicht antwortet, holt die App stattdessen die
Wochen-Schlusskurse dort. Die kostenlose Stufe erlaubt 25 Anfragen pro Tag.
Ist das Limit erreicht, zeigt die App für diese Symbole die zuletzt
bekannten Kurse; die Symbole mit dem ältesten Cache kommen zuerst dran. Ohne
Key und bei einem onvista-Ausfall bleiben die zuletzt bekannten Kurse
sichtbar, und die App versucht es beim nächsten Laden erneut. Wann der
Ersatz greift, legt `shouldFallBackToAlphaVantage` in
`src/data/priceCache.ts` fest.

Symbole folgen Alpha Vantages Notation für Xetra, z. B. `SAP.DEX` oder
`EUNL.DEX` (iShares Core MSCI World). Die zugehörige ISIN ermittelt die App
über die onvista-Suche und merkt sie sich.

## Edelmetalle

Gold und Silber lassen sich wie jede andere Position über das
Transaktionsformular erfassen („Art des Wertpapiers“ → „Edelmetall“, dann
Gold oder Silber wählen). Stückzahl ist in **Feinunze (oz)**. Die Preise
setzen sich aus drei Quellen zusammen:

- **Verlauf** (Wochenkurse in USD): Alpha Vantage (`GOLD_SILVER_HISTORY`),
  dafür braucht es den API-Key.
- **Aktueller Preis:** Spotpreis von [gold-api.com](https://gold-api.com),
  ohne Key. Er ist der Punkt für „heute“. Ohne Alpha-Vantage-Key zeigt die
  App nur diesen einen Punkt.
- **Umrechnung in EUR:** Jeder Punkt wird mit dem EZB-Referenzkurs seines
  Tages umgerechnet, abgerufen über [Frankfurter](https://frankfurter.dev)
  (ohne Key, einmal pro Tag für beide Metalle). Der Verlauf nutzt also den
  historischen Wechselkurs, nicht den heutigen.

Platin und Palladium sind nicht angebunden: gold-api.com liefert dafür nur
den aktuellen Preis, keinen Verlauf.

## Watchlist

Wertpapiere lassen sich per ISIN oder WKN suchen und auf eine Watchlist
setzen, ohne eine Transaktion zu erfassen. Die Suche läuft über die
(undokumentierte, aber frei und ohne Key nutzbare) Instrumentensuche von
[onvista.de](https://www.onvista.de) — Alpha Vantage kann nur nach Name
oder Ticker suchen, nicht nach ISIN/WKN. Da die API inoffiziell ist, kann
sie sich ohne Vorankündigung ändern; fällt die Suche aus, zeigt die App
eine Fehlermeldung statt abzustürzen. Watchlist-Einträge zeigen den
aktuellen Kurs und die Veränderung seit Aufnahme an und zählen wie
gehaltene Positionen über denselben Kurs-Cache.

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
