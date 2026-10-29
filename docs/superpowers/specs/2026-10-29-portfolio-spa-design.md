# Aktienportfolio-SPA (GitHub Pages, localStorage)

## Context
Steffen möchte sein Aktien-/ETF-Depot grafisch darstellen: Käufe und Verkäufe (Datum, Stückzahl, Preis) erfassen und die historische Entwicklung des Depots sehen. Die App ist eine reine Single-Page-App, wird später auf GitHub Pages gehostet (kein Server) und speichert alle Daten im localStorage. Das Verzeichnis `/Users/steffen/projects/coding/family-office` ist leer (noch kein Git-Repo); Node 25 / npm 11 sind vorhanden.

**Getroffene Entscheidungen**
- Kursdaten: **Alpha Vantage** (kostenloser API-Key, CORS-fähig, unterstützt Xetra-Ticker wie `MBG.DEX`). Twelve Data scheidet aus (Free-Plan nur US-Märkte).
  - `TIME_SERIES_WEEKLY` liefert 20+ Jahre kostenlos (`TIME_SERIES_DAILY` full ist Premium) → Historie auf Wochenbasis.
  - Limit 25 Requests/Tag → Kurs-Cache in localStorage, max. 1 Abruf pro Ticker und Tag.
- Transaktionen: **Kauf + Verkauf** (Datum, Stückzahl, Preis je Stück in EUR, Gebühren optional).
- Währung: **nur EUR-Handelsplätze** (Xetra/deutsche Börsen), keine FX-Umrechnung.
- Grafiken: Depotwert vs. Investiert (Zeitverlauf), Aufteilung (Donut), Positionstabelle, Einzelkurs mit Kauf-/Verkaufsmarkern.
- Stack: **Vite + React + TypeScript**, Recharts, Vitest, Deployment per GitHub Action.

## Architektur

```
family-office/
  index.html
  vite.config.ts            # base: './' (läuft unter jedem Pages-Pfad), Vitest-Config
  .github/workflows/deploy.yml   # build + actions/deploy-pages bei Push auf main
  docs/superpowers/specs/2026-10-29-portfolio-spa-design.md   # dieses Design als Spec
  src/
    domain/                 # reine Funktionen, kein React, vollständig getestet
      types.ts              # Transaction, Instrument, PricePoint, Position, HistoryPoint
      portfolio.ts          # computePositions(transactions, latestPrices) → Position[]
      history.ts            # buildHistory(transactions, priceSeries) → HistoryPoint[]
    data/
      storage.ts            # versionierte localStorage-Keys, load/save, JSON-Export/Import
      alphaVantage.ts       # fetchWeekly(symbol, key), searchSymbol(query, key), Fehlererkennung
      priceCache.ts         # getSeries(symbols): Cache prüfen (fetchedAt < heute?) → sequentiell nachladen
    hooks/
      usePortfolioStore.ts  # React-State + Persistenz (Transaktionen, Instrumente, Settings)
      usePrices.ts          # Kurse laden, Status (loading / rate-limited / error)
    components/
      SettingsDialog.tsx    # API-Key, Export/Import
      TransactionForm.tsx   # Kauf/Verkauf erfassen, optional Ticker-Suche (SYMBOL_SEARCH)
      TransactionList.tsx   # bearbeiten/löschen
      KpiRow.tsx            # Depotwert, Investiert, G/V absolut + %
      HistoryChart.tsx      # Linie Depotwert + Linie/Fläche Investiert
      AllocationDonut.tsx
      PositionsTable.tsx
      TickerChart.tsx       # Kursverlauf eines Symbols + Marker für Käufe/Verkäufe
    App.tsx                 # Dashboard-Layout (eine Seite, kein Router)
```

## Datenmodell (localStorage, Präfix `pf.v1.`)
- `pf.v1.transactions`: `Transaction[]` = `{ id, type: 'buy'|'sell', symbol, date: 'YYYY-MM-DD', quantity, price, fees }`
- `pf.v1.instruments`: `Record<symbol, { name, kind: 'stock'|'etf' }>`
- `pf.v1.settings`: `{ apiKey }`
- `pf.v1.prices`: `Record<symbol, { fetchedAt: 'YYYY-MM-DD', series: [date, close][] }>` (aufsteigend sortiert)
- Versionierter Präfix erlaubt spätere Migrationen. Export/Import als eine JSON-Datei (Transaktionen + Instrumente; API-Key und Cache werden nicht exportiert).

## Kernlogik
- **Positionen** (`portfolio.ts`): Transaktionen chronologisch durchlaufen; pro Symbol Stückzahl und Einstandswert führen. Kauf: `qty += q`, `cost += q*price + fees`. Verkauf: Stückzahl reduzieren, Einstandswert anteilig nach **Durchschnittskostenmethode** reduzieren (wie Broker den Einstandskurs anzeigen); realisierter G/V wird mitgeführt. Verkauf von mehr Stücken als im Bestand → Validierungsfehler im Formular.
  - *Learning-Mode-Beitrag:* Steffen implementiert den Verkaufszweig `applySell()` in `portfolio.ts` (5–10 Zeilen, Entscheidung Durchschnittskosten vs. FIFO), die Tests sind vorher vorbereitet.
- **Historie** (`history.ts`): Zeitachse = alle Wochendaten aus den Kursreihen ab dem ersten Transaktionsdatum. Für jeden Zeitpunkt: Bestand je Symbol aus Transaktionen ≤ Datum; Kurs = letzter Schlusskurs ≤ Datum (forward fill; vor dem ersten Kurspunkt wird der Kaufpreis genommen). `value = Σ qty × close`, `invested = Σ Einstandswert`. Zusätzlich ein Punkt für „heute“ mit dem neuesten Kurs.
- **Alpha-Vantage-Client**: Antwort auf `Note` / `Information` (Limit) und `Error Message` (unbekannter Ticker) prüfen, da HTTP immer 200 liefert → typisierte Fehler `RateLimitError` / `UnknownSymbolError`. Nachladen sequentiell; beim ersten RateLimit stoppen, bereits gecachte Daten weiter anzeigen, Hinweisbanner zeigen.
- **Ticker-Suche**: `SYMBOL_SEARCH` nur per Button (kostet einen Call), Ergebnisse auf Währung EUR filtern; Symbol kann auch direkt eingetippt werden (z. B. `SAP.DEX`).

## UI
Eine Dashboard-Seite: Kopfzeile (Titel, Einstellungen, Kursaktualisierung mit Stand-Datum) → KPI-Zeile → HistoryChart (volle Breite, Zeitraumwahl 1J/3J/5J/Max) → Donut + Positionstabelle nebeneinander (mobil gestapelt) → TickerChart mit Symbol-Auswahl → Transaktionsformular + Liste. Leerer Zustand: Hinweis „API-Key hinterlegen“ und „erste Transaktion erfassen“. Zahlen und Datum im deutschen Format (`Intl.NumberFormat('de-DE', {style:'currency', currency:'EUR'})`). Hell/dunkel über `prefers-color-scheme`. Bei der Umsetzung werden die Skills `frontend-design` und `dataviz` für Gestaltung und Diagrammfarben geladen.

## Umsetzungsreihenfolge (TDD für domain/ und data/)
1. `git init`, Spec nach `docs/superpowers/specs/2026-10-29-portfolio-spa-design.md` schreiben, committen.
2. Vite-Projekt anlegen (`npm create vite@latest . -- --template react-ts`), Recharts + Vitest installieren, `base: './'`.
3. `domain/types.ts`, dann Tests + Implementierung `portfolio.ts` (Steffen: `applySell`), dann `history.ts`.
4. `data/storage.ts`, `data/alphaVantage.ts` (Tests mit JSON-Fixtures für Erfolg, Limit, unbekannter Ticker; `fetch` gemockt), `priceCache.ts`.
5. Hooks, danach Komponenten: Formular/Liste → KPI + Tabelle → HistoryChart → Donut → TickerChart → Settings mit Export/Import.
6. `.github/workflows/deploy.yml` (Node-Setup, `npm ci`, `npm test`, `npm run build`, `actions/upload-pages-artifact` + `actions/deploy-pages`), README mit Hinweis „Pages-Quelle: GitHub Actions“.

## Verifikation
- `npm test`: Unit-Tests für Positionen (Kauf, Teilverkauf, Gebühren, Überverkauf), Historie (forward fill, Kauf mitten in der Woche, Verkauf), API-Parsing und Fehlerfälle.
- `npm run build && npm run preview`, dann in Chrome (claude-in-chrome) prüfen: Transaktionen erfassen, Reload → Daten bleiben erhalten, Export/Import einmal hin und zurück, alle vier Grafiken mit echten Kursen (Steffens API-Key, z. B. `SAP.DEX`, `EUNL.DEX`), zweiter Reload löst keinen neuen API-Call aus (Network-Tab), mobile Breite.
- Deployment: wenn Steffen ein GitHub-Repo angelegt und gepusht hat, Workflow-Lauf und Pages-URL prüfen (das GitHub-MCP ist aktuell nicht verbunden, also über `gh` oder manuell).
