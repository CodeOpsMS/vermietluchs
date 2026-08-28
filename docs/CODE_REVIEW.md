# Code-Review und Testbericht

Stand: 27. August 2026, Ausgangsstand `27cbf14`. Geprüft wurden Client,
Express-API, SQLite-Persistenz, Fachlogik, Backup, Tests, Docker und GitHub
Actions.

## Verifikation

- Formatierung, TypeScript und ESLint sind fehlerfrei.
- 21 Vitest-Dateien mit 192 Unit-, Komponenten-, Datenbank- und API-Tests sind grün.
- Die V8-Coverage erfasst bewusst den gesamten TypeScript-/TSX-Quelltext. Sie
  liegt bei 46,02 % Zeilen, 80,02 % Zweigen und 85,34 % Funktionen; strengere
  Schichtgrenzen schützen Fachlogik, Server, gemeinsame Schemata und reine
  Client-Logik.
- Beide Chromium-End-to-End-Tests sind grün.
- Produktions-Build für Client und Server ist erfolgreich.
- Eine saubere Installation mit `npm ci` und der Audit melden keine bekannte
  Schwachstelle.
- Der bisherige Docker-Build auf `main` ist grün. Lokal steht keine Docker-Engine
  zur Verfügung; die CI startet das Image künftig zusätzlich und prüft
  `/api/health`, bevor ein Release veröffentlicht wird.

## In diesem Stand behoben

- Beim normalen Tippen eines Kostenbetrags blieb der umlagefähige Betrag auf
  der ersten Ziffer stehen.
- Deutsche Tausenderpunkte wie `1.000` wurden als `1` interpretiert.
- Ein ungültiges optionales Mietende wurde beim Verlassen des Feldes still
  gelöscht und konnte dadurch als unbefristeter Vertrag gespeichert werden.
- Direktkosten ließen sich einem Mietverhältnis außerhalb des Kostenjahres
  zuordnen. Client und API prüfen nun den Zeitraum.
- Eine verspätete Abrechnungsantwort konnte Auswahl und Vorschau
  auseinanderlaufen lassen. Auswahl und Archivaktionen sind währenddessen
  gesperrt, und geöffnete Snapshots synchronisieren das Mietverhältnis.
- Neue Abrechnungssnapshots werden versioniert und beim Lesen nicht erneut
  verändert. Die Berechnungs-Prüfsumme bleibt damit konsistent; alte Snapshots
  werden weiterhin bereinigt.
- Nicht zuordenbare Überzahlungen alter Clients wurden fälschlich als
  Garagenzahlung gebucht. Sie werden nun abgelehnt und verlangen explizite
  Teilbeträge.
- DNS-Rebinding über einen frei gewählten `Host`-Header wird blockiert. Eigene
  DNS-Namen lassen sich kontrolliert freigeben.
- Ungültiges JSON und zu große Requests liefern 400 beziehungsweise 413 statt 500. Ein fehlgeschlagener SQLite-Healthcheck liefert 503.
- Vorauszahlungsmonate `00` und `13`, Buchungen außerhalb des ausgewählten
  Kalenderjahres und irreführende Versionskonflikt-Hinweise wurden korrigiert.
- Nach einem abgebrochenen Backup-Import kann dieselbe Datei erneut gewählt
  werden.
- Migrationen werden numerisch sortiert. Doppelte Versionsnummern und das
  nachträgliche Umbenennen bereits angewandter Migrationen brechen nun vor
  weiteren Änderungen mit einer verständlichen Fehlermeldung ab.
- Neue Regressionstests sichern deutsche Zahlen, Kalendergrenzen,
  Formularabbildungen, Client-API-Fehler, Host-Freigaben, ungültige JSON-Bodies,
  Healthchecks und Datenbankmigrationen ab.

## Verbleibende Risiken und Verbesserungen

### Hohe Priorität

1. **Keine Anmeldung:** Der Host-Schutz reduziert Browserangriffe, ersetzt aber
   keine Authentifizierung. Jedes Gerät im freigegebenen Netz kann die Anwendung
   erreichen. Der Port darf weiterhin nicht direkt ins Internet gestellt
   werden.
2. **Personenzahl ohne Historie:** Das Domainmodell kann zeitabhängige
   Personenzahlen berechnen, Datenbank und API speichern jedoch nur den aktuellen
   Wert. Eine Änderung kann offene Altjahre rückwirkend beeinflussen.
3. **Zählerwechsel nicht durchgängig angebunden:** Die Fachlogik kennt Wechsel
   und alten Endstand, Schema, API und Oberfläche noch nicht. Ein realer
   Zählerwechsel kann daher als negativer oder zu kleiner Verbrauch erscheinen.
4. **Archivdruck ohne Render-Version:** Gespeicherte Daten sind unveränderlich,
   werden aber mit dem jeweils aktuellen UI gruppiert und gedruckt. Ein späterer
   Ausdruck kann sich optisch oder in seiner Gruppierung ändern. Langfristig
   sollte ein versioniertes Renderformat oder das fertige PDF gespeichert werden.

### Mittlere Priorität

- Der Backup-Export ist unbegrenzt, der JSON-Import jedoch auf 50 MB begrenzt.
- Importierte Snapshot-Payloads werden strukturell, aber nicht durch
  Neuberechnung aller Summen und Prüfsummen validiert.
- Bereits angewandte Migrationen speichern noch keine Inhaltsprüfsumme. Eine
  nachträgliche Änderung unter demselben Dateinamen wäre daher nicht erkennbar.
- Viele REST-Zod-Schemas sind nicht `.strict()`. Tippfehler in unbekannten
  Feldern können dadurch still entfernt werden.
- API-Antworten werden im Client typisiert, aber nicht zur Laufzeit validiert.
- Archivlisten verwenden aktuelle Mieter- und Wohnungsnamen statt Snapshot-Namen.
- Mobile Navigation, Live-Regions und Feld-Fehlerzuordnung können barriereärmer
  werden.
- Die React-TSX-Oberfläche wird im Coverage-Bericht ehrlich mitgezählt, aber
  überwiegend über zwei Chromium-E2E-Abläufe statt isolierter Komponententests
  geprüft. Der große Ablauf könnte in kleinere Szenarien geteilt und um weitere
  Browser ergänzt werden.

## Abhängigkeiten und Updates

Die direkte und transitive Abhängigkeitsstruktur steht in
[DEPENDENCIES.md](DEPENDENCIES.md). Sinnvolle kompatible Updates sollten in
einem eigenen Pull Request erfolgen. Majorwechsel auf Zod 4, Vite 8, Vitest 4
oder TypeScript 7 brauchen jeweils eine gezielte Migration und die vollständige
Prüfsuite.
