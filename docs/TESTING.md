# Teststrategie

Stand: 30. August 2026. Die Suite umfasst zusätzlich gezielte Tests der
KI-Provider, Sicherheitsgrenzen und des transaktionalen Imports sowie ein
Chromium-Szenario für die optionale Navigation.

## Prüfungen

| Ebene                       | Schwerpunkt                                                            | Befehl                  |
| --------------------------- | ---------------------------------------------------------------------- | ----------------------- |
| Unit- und Regressionstests  | Fachberechnung, Rundung, Datum, Zahlen, Formularmodelle und Client-API | `npm test`              |
| Integrations- und API-Tests | Express, SQLite, Migrationen, Backups, Konflikte und HTTP-Schutz       | `npm test`              |
| Coverage                    | gesamter TypeScript-/TSX-Quelltext und strengere Kernschichten         | `npm run test:coverage` |
| Browser                     | wichtigster Arbeitsablauf mit temporärer Datenbank in Chromium         | `npm run test:e2e`      |
| KI-Grenzen                  | Providerformat, Schlüssel, Ziele, Entwurf und atomarer Import          | `npm run test:ai`       |
| Container-Image             | leere Datenbank und reproduzierbare Beispieldaten für 2023             | siehe unten             |
| vollständige Commit-Prüfung | Format, Typen, Lint, Coverage-Tests und Build                          | `npm run check`         |

Nach dem Bauen des Images prüft die CI zwei vollständig getrennte, neue
Container ohne Daten-Volume:

```bash
docker build --tag vermietluchs:test .
bash scripts/test-container-image.sh vermietluchs:test empty
bash scripts/test-container-image.sh vermietluchs:test example
```

Der Leertest kontrolliert über den JSON-Backup-Export, dass sämtliche
Fachtabellen leer sind. Der Beispieltest beginnt ebenfalls leer, legt über die
öffentliche API ein synthetisches Haus mit Einheit, Mietverhältnis, Kosten,
Zahlung, Zähler und Ablesungen für 2023 an und prüft anschließend Export und
Dashboard. Dadurch kann kein bereits vorhandenes Host-Volume den Test
beeinflussen. Weil `/data` nicht durch einen Mount verdeckt wird, erkennt der
Leertest außerdem versehentlich in das Image übernommene Datenbanken.

Der HTML-Bericht wird unter `coverage/index.html` erzeugt. Die CI lädt den
vollständigen Ordner auch bei einem fehlgeschlagenen Testlauf für 14 Tage als
Artefakt `vitest-coverage` hoch.

## Mindestabdeckung

| Bereich                                     | Zeilen | Statements | Zweige | Funktionen |
| ------------------------------------------- | -----: | ---------: | -----: | ---------: |
| gesamter Quelltext einschließlich React-TSX |   40 % |       40 % |   75 % |       75 % |
| Fachlogik `src/domain`                      |   90 % |       90 % |   80 % |      100 % |
| Server `src/server`                         |   85 % |       85 % |   75 % |       95 % |
| gemeinsame Regeln `src/shared`              |   80 % |       80 % |   70 % |      100 % |
| reine Client-Logik `src/client/**/*.ts`     |   95 % |       95 % |   85 % |       95 % |

Die globale Messung schließt die React-Komponenten bewusst nicht aus. Ihre
Zeilenabdeckung ist niedriger, weil Playwright-Ausführungen nicht in die
Vitest-V8-Zahlen einfließen. Die wichtigen UI-Abläufe werden daher separat im
echten Browser geprüft, während die extrahierte Client-Logik eine hohe eigene
Schranke besitzt.

## Abgesicherte Regressionen

- `number-input-regression.test.ts`: deutsche Dezimal- und Tausenderformate.
- `cost-form-regression.test.ts`: automatische Spiegelung umlagefähiger Kosten.
- `payment-year-regression.test.ts`: gültige Fälligkeiten und Kalendergrenzen.
- `client-api*.test.ts`: HTTP-Methoden, Revisionen, Backups und echte gegenüber
  fachlichen Konflikten.
- `client-models.test.ts` und `theme.test.ts`: verlustfreie Formularabbildungen,
  Altformat-Zahlungen, Zählergruppierung und Farbschema.
- `database-migrations.test.ts`: Reihenfolge, doppelte Versionen, Umbenennung und
  Idempotenz.
- `http-infrastructure.test.ts`: Host-Allowlist, JSON-Fehler und fehlerhafter
  SQLite-Healthcheck.
- `ai*.test.ts`: feste Cloud-Ziele, private Ollama-Ziele, Schlüsselschutz,
  Providerpayloads, deaktivierter Standardzustand und atomarer Import ohne
  Mieter oder Abrechnungen.

Ein Fehlerfix sollte zuerst durch einen kleinen Test reproduziert werden. Der
Test bleibt anschließend als Regression bestehen. Zeit, Zufall, Netzwerk und
Datenbanken werden kontrolliert beziehungsweise pro Test isoliert, damit die
Suite schnell und reproduzierbar bleibt.
