# Projektweiter Code-Review — 7. September 2026

## Aktualisierung nach dem KI-Scan-Merge

Der neue Main `f47d92cc23fbc5e6e0e026951f0832546d3e4d94` enthält PR #19
(KI-PDF-Scan, universelle Modelleingabe) und ist als `v0.0.8` markiert.
Er wurde in die beiden betroffenen Review-Branches gemergt; die bestehende
Historie bleibt erhalten. Die anderen zwei Review-Branches sind unverändert
und lassen sich weiterhin konfliktfrei ergänzen.

- `codex/review-client-consistency`, Merge-Commit `bf82b97`: `loadAll()` lädt
  weiterhin die KI-Einstellungen und prüft die Request-ID, bevor Fachdaten,
  KI-Einstellungen oder Auswahl aktualisiert werden. Die vier zusätzlichen
  KI-Nachladetests sind jetzt dauerhaft enthalten. Bestehende Browser-Mocks
  liefern außerdem ein korrekt geformtes KI-Einstellungsobjekt.
- `codex/review-dependency-security`, Merge-Commit `2dd6833`: der Konflikt in
  `docs/DEPENDENCIES.md` ist aufgelöst. Die neuen PDF-Abhängigkeiten und der
  zusätzliche KI-CI-Schritt bleiben erhalten. `qs` 6.16.0 ist bereits im neuen
  Main enthalten; die aktuelle Lockdatei hat deshalb keine Differenz zu Main.
  Die drei Action-Pins bleiben zusätzliche Änderungen dieses Branches.

Nach frischer Installation mit `npm ci` wurden die Branches einzeln und in
einem separaten Detached-Worktree gemeinsam geprüft:

| Stand                                    | Unit-/API-Tests | Chromium-Szenarien |
| ---------------------------------------- | --------------: | -----------------: |
| Aktualisierter Client-Branch             |             261 |                 16 |
| Aktualisierter Sicherheits-Branch        |             261 |                  4 |
| Alle vier Review-Branches mit neuem Main |             276 |                 16 |

Alle Prüfungen bestanden. `npm run check` umfasst Formatierung, TypeScript,
ESLint, Coverage-Schwellen und Produktionsbuild. Der erneute Audit der
gemeinsamen Lockdatei meldet 0 bekannte Schwachstellen bei 466 Abhängigkeiten.
Die Kombination der Code-Stände `bf82b97`, `2dd6833`, `bd8dbb9` und `7877b77`
ergab ohne weitere Konfliktauflösung den lokalen Testcommit `bcc6c91`.
Dieser Bericht ist die anschließende, separat formatgeprüfte Dokumentation.

Es wurden keine Live-Daten verwendet und keine externen KI-Aufrufe durchgeführt.
Main, Release-Tags und Deployment wurden nicht geändert. Docker-Build und
Container-Smoke-Tests müssen weiterhin in der PR-CI ausgeführt werden; lokal
ist keine Docker-CLI verfügbar. Ein Feature-Branch-Push allein startet im
bestehenden Workflow keinen CI-Lauf, sofern kein Pull Request offen ist.

Die folgenden Abschnitte dokumentieren den ursprünglichen Review vor PR #19;
ihre Basis- und Testzahlen sind historische Ergebnisse.

## Ursprünglicher Ausgangsstand und Umfang

Basis ist der frisch abgerufene `origin/main`-Commit
`df5fa54c25ff4a1acd0172b1198d526a48be9723`, einschließlich Wirtschaftsplan und
den danach gemergten Abhängigkeitsupdates. Der zuletzt vorhandene Release-Tag
ist `v0.0.7`. Ein erneuter Fetch zum Abschluss bestätigte denselben Main-Stand.

Geprüft wurden React-Seiten und Formularmodelle, Zahlen-/Datumsdarstellung,
Abrechnung und Druckansichten, Domainberechnung, sämtliche REST-Ressourcen,
SQLite-Migrationen und Beziehungen, Revisionen, Backup-Import/-Export,
HTTP-Schutz, Testabdeckung, Abhängigkeiten sowie Docker- und CI-Konfiguration.
Die Prüfung kombiniert Quelltextanalyse, vorhandene Tests und gezielte neue
Regressionen; sie ist keine Garantie vollständiger Fehlerfreiheit.

Alle Arbeiten erfolgten in einem isolierten Git-Worktree mit synthetischen
Testdaten. Der ursprüngliche Feature-Branch, das separate MCP-Projekt und der
Live-Container wurden nicht verändert. Es gab keinen Merge nach `main`, kein
Release und kein Deployment.

## Unabhängige Verbesserungsbranches

Alle vier Branches basieren direkt auf dem obigen Main-Commit; keiner setzt
einen der anderen Branches voraus.

| Branch                                                                                                              | Inhalt                                                          | Unit-/API-Tests | Chromium-Szenarien |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------: | -----------------: |
| [codex/review-plan-validation](https://github.com/CodeOpsMS/vermietluchs/tree/codex/review-plan-validation)         | Sichere Wirtschaftsplan-Eingaben und Backup-Geldbeträge         |             209 |                  2 |
| [codex/review-tenancy-period](https://github.com/CodeOpsMS/vermietluchs/tree/codex/review-tenancy-period)           | Mietzeitraum und bestehende Jahreszuordnungen konsistent halten |             208 |                  2 |
| [codex/review-client-consistency](https://github.com/CodeOpsMS/vermietluchs/tree/codex/review-client-consistency)   | Neuester Datenstand, Zahlstatus und deutsche Dezimalwerte       |             201 |                 10 |
| [codex/review-dependency-security](https://github.com/CodeOpsMS/vermietluchs/tree/codex/review-dependency-security) | `qs` aktualisieren, CI-Actions pinnen und Review dokumentieren  |             201 |                  2 |

### Wirtschaftsplan und Backup

- Nichtleere, ungültige Monatsvorauszahlungen wurden als `null` akzeptiert.
  Sie blockieren jetzt das Speichern; leer und ausdrücklich `0` bleiben
  unterschiedliche, gültige Eingaben.
- Die Summe zweier Vertragsvorauszahlungen konnte sichtbare Gleitkommareste
  enthalten. Die Eingabehilfe summiert jetzt in Cent.
- Einzeln gültige, aber in Summe nicht mehr sicher darstellbare Beträge konnten
  das Formular zum Absturz bringen. Die API speicherte solche Pläne sogar vor
  ihrem Fehler beim anschließenden Lesen. Formular, POST und PUT prüfen die
  Jahressumme jetzt vor der Berechnung beziehungsweise Datenänderung.
- Der Backup-Import akzeptierte ebenfalls unsichere Centbeträge und
  Jahressummen. Er weist sie nun zurück, ohne den Datenbestand zu verändern.

Regressionen: `tests/operating-cost-plan.test.ts`,
`tests/api-plan-validation.test.ts` und Ergänzungen im vorhandenen Browserablauf.
Die neuen Unit-/API-Fehlerfälle scheiterten vor dem Fix und bestehen danach.

### Änderungen von Mietzeiträumen

Kosten und Pläne wurden beim Anlegen auf das Mietjahr geprüft, beim späteren
Ändern des Mietzeitraums jedoch nicht. Dadurch konnte ein Plan aus der
Mieterauswahl verschwinden und der eigene Backup-Export anschließend beim
Import abgelehnt werden.

Vertragsbearbeitung und Mieterwechsel prüfen jetzt bestehende Pläne und direkt
zugeordnete Kosten gemeinsam. Unvereinbare Änderungen liefern einen fachlichen
409-Konflikt mit Handlungsanweisung. Bei abgelehnten Änderungen werden weder
Jahresdaten noch Zahlungen gelöscht. Teiljahre innerhalb desselben Jahres bleiben möglich;
Planbeträge und Planmonate werden nicht automatisch angepasst.

`tests/api-tenancy-period.test.ts` reproduziert sechs zuvor akzeptierte
unvereinbare Änderungen und prüft außerdem den gültigen Teiljahresfall.
Der vollständige Datenbestand, Revisionen, unbezahlte Folgemonate und die
Wiederherstellbarkeit werden mitgeprüft.

### Oberfläche und Zahlen

- Überlappende Nachladevorgänge konnten aktuelle Daten oder die Hausauswahl
  durch eine ältere Antwort ersetzen. Auch veraltete Fehler und ein zu früh
  beendeter Ladeindikator waren möglich. Nur die zuletzt gestartete Anfrage
  darf nun Daten, Fehler und Ladezustand aktualisieren.
- `0,10 + 0,20` konnte beim direkten Gleitkommavergleich eine Zahlung von
  `0,30` als nur teilweise bezahlt erscheinen lassen. Der Statusvergleich
  erfolgt jetzt in ganzen Cent.
- Gespeicherte gebrochene Personenzahlen wurden als deutsche Kommazahlen an
  ein HTML-Zahlenfeld übergeben, das diesen Wert nicht akzeptierte. Beide
  Personenfelder verwenden jetzt denselben deutschen Dezimal-Eingabeweg wie
  die übrigen Formulare; die fachliche Positivitätsprüfung bleibt erhalten.
- Das Einheitengewicht wird mit deutschem Dezimalkomma ausgegeben.

Die acht neuen Fälle in `tests/e2e/client-refresh.spec.ts` und
`tests/e2e/client-numbers.spec.ts` scheiterten gegen den Ausgangsbuild und
bestehen mit den Korrekturen. Ihre HTTP-Antworten sind kontrollierte Testdaten.

### Abhängigkeiten und CI

Der Ausgangs-Audit meldete ein betroffenes Paket (`qs` 6.15.3) mit zwei moderaten
Advisories. Das gezielte Lockfile-Update auf 6.16.0 beseitigt beide Meldungen;
direkte Paketversionen und Hauptversionen bleiben unverändert. Details und
Quellen stehen in [DEPENDENCIES.md](DEPENDENCIES.md). Eine Ausnutzung über diese
Anwendung wurde nicht nachgewiesen.

Die drei noch über bewegliche `v7`-Tags referenzierten CI-Schritte wurden auf
die über die offiziellen Repositories verifizierten Commit-SHAs gepinnt.
Release-Ablauf, Berechtigungen und Audit-Abbruchschwelle bleiben unverändert.

## Gemeinsame Abschlussprüfung

Zusätzlich zur unabhängigen Prüfung wurden die Code-Commits `5880b18`,
`bd8dbb9`, `7877b77` und `1614a70` in einem abgetrennten lokalen Teststand
zusammengeführt. Das erfolgte konfliktfrei und ohne Änderung an `main`.

- Frische Installation aus dem Lockfile mit `npm ci`: erfolgreich.
- `npm run check`: Formatierung, TypeScript, ESLint, Coverage-Grenzen und
  Produktions-Build erfolgreich.
- 24 Vitest-Dateien mit **216 bestandenen Tests**.
- `npm run test:e2e`: **10 bestandene Chromium-Szenarien**, einschließlich
  vollständigem Verwaltungsablauf, Backup-Restore und mobiler Navigation.
- `npm audit --json`: **0 bekannte Schwachstellen** zum Prüfzeitpunkt.
- V8-Abdeckung des kombinierten Stands: 46,24 % Zeilen, 79,94 % Zweige,
  85,09 % Funktionen. Die Domain erreicht 91,97 % Zeilen; Browserausführungen
  zählen nicht zur Vitest-V8-Abdeckung.
- `git diff --check`: erfolgreich.

Die zusätzlichen Berichtstexte verändern keinen ausführbaren Code. Ein
lokaler Container-Build und die beiden Docker-Smoke-Tests konnten mangels
Docker-CLI nicht ausgeführt werden. Die bestehenden CI-Schritte müssen diese
Prüfungen im späteren Pull Request durchführen. Nur das Pushen eines
Feature-Branches startet im aktuellen Workflow keinen CI-Lauf.

## Bewusst verbleibende Aufgaben

- **Betriebsschutz:** Die Anwendung hat weiterhin absichtlich keine Anmeldung.
  Die Maßnahmen aus [SECURITY.md](../SECURITY.md) bleiben erforderlich.
- **Personenhistorie und Zählerwechsel:** In der Domain vorgesehen, aber noch
  nicht vollständig über Datenbank, API und Oberfläche modelliert. Das braucht
  eigene fachliche Entscheidungen, Migrationen und Tests.
- **Archivtreue:** Gespeicherte Abrechnungsdaten werden weiterhin mit dem
  aktuellen Renderer gedruckt; Archivlisten verwenden aktuelle Stammdatennamen.
  Render-Versionierung beziehungsweise gespeicherte PDFs bleiben Folgeaufgaben.
- **Große Datenmengen:** Der Client lädt die Ressourcensammlungen vollständig;
  Exportgröße und das 50-MB-Importlimit sind nicht aufeinander abgestimmt.
  Lasttests und Pagination wurden nicht ergänzt.
- **Weitergehende Integritätsprüfung:** Migrationsinhalte besitzen noch keine
  Prüfsumme. Importierte Abrechnungssnapshots werden strukturell geprüft, aber
  nicht vollständig arithmetisch nachgerechnet.
- **Testbreite:** Die Browserprüfung erfolgt in Chromium, nicht in Safari oder
  Firefox. Druckinhalte werden automatisiert geprüft; eine neue visuelle
  PDF-Seitenprüfung und ein Test mit produktiven Daten fanden nicht statt.

Die Änderungen verhindern die reproduzierten Fehler für künftige Eingaben.
Bereits inkonsistente Live-Datensätze wurden nicht untersucht oder automatisch
repariert. Vor einem späteren Deployment sollte ein frisches Backup gesichert
und die Container-CI erfolgreich abgeschlossen werden.
