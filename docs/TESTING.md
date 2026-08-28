# Teststrategie

Stand: 27. August 2026. Die Suite umfasst 21 Vitest-Dateien mit 192 Tests sowie
zwei Chromium-End-to-End-Szenarien.

## Prüfungen

| Ebene                       | Schwerpunkt                                                            | Befehl                  |
| --------------------------- | ---------------------------------------------------------------------- | ----------------------- |
| Unit- und Regressionstests  | Fachberechnung, Rundung, Datum, Zahlen, Formularmodelle und Client-API | `npm test`              |
| Integrations- und API-Tests | Express, SQLite, Migrationen, Backups, Konflikte und HTTP-Schutz       | `npm test`              |
| Coverage                    | gesamter TypeScript-/TSX-Quelltext und strengere Kernschichten         | `npm run test:coverage` |
| Browser                     | wichtigster Arbeitsablauf mit temporärer Datenbank in Chromium         | `npm run test:e2e`      |
| vollständige Commit-Prüfung | Format, Typen, Lint, Coverage-Tests und Build                          | `npm run check`         |

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

Ein Fehlerfix sollte zuerst durch einen kleinen Test reproduziert werden. Der
Test bleibt anschließend als Regression bestehen. Zeit, Zufall, Netzwerk und
Datenbanken werden kontrolliert beziehungsweise pro Test isoliert, damit die
Suite schnell und reproduzierbar bleibt.
