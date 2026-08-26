# Vermietluchs

Vermietluchs ist eine kleine, selbst betriebene Web-App für Häuser,
Wohnungen, Mietverhältnisse, Mietzahlungen und Betriebskostenabrechnungen.
Sie ist bewusst überschaubar aufgebaut, damit der Code auch mit ein bis zwei
Jahren Programmiererfahrung gut nachvollziehbar bleibt.

> **Sicherheit:** Vermietluchs hat absichtlich keine Benutzeranmeldung. Stelle
> Port 3001 nur in deinem vertrauenswürdigen Heimnetz bereit und niemals direkt
> ins Internet.

## Was die App kann

- mehrere Häuser und Wohnungen verwalten
- zwischen hellem Tagdesign und dunklem Nachtdesign wechseln
- mehrere aufeinanderfolgende Mietverhältnisse je Wohnung abbilden
- Mieterwechsel mit optionalen Zwischenablesungen erfassen
- interne Kosten und umlagefähige Mieterkosten getrennt pflegen
- Kosten nach Fläche, Personen, Einheiten, Verbrauch oder direkt verteilen
- interne Einzelkosten in Mieter-Sammelpositionen wie Wohnung, Garage und Grundsteuer bündeln
- einen bereits feststehenden Mieteranteil ohne erneute Zeitaufteilung erfassen
- Zählerstände und bei Bedarf nachvollziehbare Interpolationen verwenden
- Soll- und Ist-Zahlungen getrennt nach Kaltmiete, Nebenkosten und Garage führen
- Abrechnungen prüfen, unveränderlich abschließen und im Browser drucken
- alle Daten als JSON sichern und transaktional wiederherstellen

## Schnellstart mit Docker

Voraussetzung ist Docker Desktop oder Docker Engine mit Compose.

```bash
git clone git@github.com:CodeOpsMS/vermietluchs.git
cd vermietluchs
docker compose up -d --build
```

Danach öffnest du `http://localhost:3001`. Die SQLite-Datenbank und
Sicherheitskopien liegen dauerhaft im Docker-Volume `vermietluchs-data`.
Von einem anderen Gerät im selben vertrauenswürdigen Netz verwendest du
`http://IP-DEINES-RECHNERS:3001`.

Container stoppen:

```bash
docker compose down
```

Vor einem Update empfiehlt sich zusätzlich ein JSON-Export unter
**Einstellungen → Datensicherung**.

## Lokale Entwicklung

Du brauchst Node.js 24 LTS oder neuer.

```bash
npm install
npm run dev
```

Die Oberfläche läuft dann unter `http://localhost:5173`, die API unter
`http://localhost:3001`. Vite leitet `/api` in der Entwicklung automatisch an
die API weiter.

Vor einem Commit:

```bash
npm run check
npm run test:e2e
```

`npm run check` prüft TypeScript, Stilregeln, Fachtests und den Produktions-Build.
`npm run test:e2e` startet zusätzlich eine isolierte temporäre Datenbank und
klickt die wichtigsten Buttons und Zahlen in einem echten Chromium-Browser
durch. Beim ersten lokalen Lauf wird Chromium mit
`npx playwright install chromium` installiert. Die GitHub-Pipeline führt beide
Prüfungen automatisch aus.

## Ein sinnvoller erster Durchlauf

1. Unter **Einstellungen** Vermieter, Bankverbindung und Zahlungsfrist setzen.
2. Ein Haus und darin mindestens eine Wohnung anlegen.
3. Ein Mietverhältnis mit Kaltmiete und Betriebskostenvorauszahlung anlegen.
4. Kosten und gegebenenfalls Zählerstände für ein Jahr erfassen.
5. Im Mietkonto die Monatszahlungen anlegen und bezahlte Beträge eintragen.
6. Unter **Abrechnung** zuerst die Vorschau prüfen. Offene Entscheidungen werden
   dort als Warnung gezeigt und verhindern den Abschluss.
7. Die fertige Abrechnung abschließen und über den Browser drucken oder als PDF
   speichern.

Ein Abschluss speichert eine unveränderliche Momentaufnahme. Spätere Änderungen
an Stammdaten verändern eine bereits abgeschlossene Abrechnung nicht. Über
„Zur Korrektur öffnen“ kann ein neuer Stand mit den aktuellen Daten berechnet
werden. Der alte Stand bleibt bis zum erneuten, atomaren Abschluss erhalten.
Eine Prüfsumme verhindert, dass zwischen Vorschau und Abschluss unbemerkt
geänderte Daten gespeichert werden.

## Ordnerstruktur

```text
src/client/       React-Oberfläche
src/server/       Express-API und SQLite-Zugriff
src/domain/       reine fachliche Berechnungen
src/shared/       gemeinsame Eingaberegeln
migrations/       nachvollziehbare Datenbankänderungen
tests/            Fach- und API-Tests
docs/             Architektur- und Fachnotizen
```

Weitere Erklärungen stehen in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) und
[docs/DOMAIN.md](docs/DOMAIN.md). Hinweise zum sicheren Betrieb findest du in
[SECURITY.md](SECURITY.md).

## Konfiguration

Im Container sind die passenden Werte bereits gesetzt. Beim lokalen Start
können diese Umgebungsvariablen angepasst werden:

| Variable                | Standard    | Bedeutung                               |
| ----------------------- | ----------- | --------------------------------------- |
| `VERMIETLUCHS_PORT`     | `3001`      | HTTP-Port                               |
| `VERMIETLUCHS_HOST`     | `127.0.0.1` | lokale Bind-Adresse                     |
| `VERMIETLUCHS_DATA_DIR` | `./data`    | Ordner für SQLite und Sicherheitskopien |

Nur der Docker-Start setzt den Host bewusst auf `0.0.0.0`, damit Geräte im
vertrauenswürdigen Heimnetz die App erreichen können.

## Datenschutz und Verantwortung

Alle Daten bleiben in deiner lokalen SQLite-Datei. Die App nutzt keine Cloud,
keine Telemetrie und keine KI-Dienste. Prüfe Betriebskostenabrechnungen vor dem
Versand trotzdem fachlich und rechtlich; Vermietluchs ersetzt keine Rechts- oder
Steuerberatung.

## Lizenz

Der Code ist **source-available und nichtkommerziell** unter der
[PolyForm Noncommercial License 1.0.0](LICENSE.md) verfügbar. Das ist bewusst
keine Open-Source-Lizenz im engeren Sinn. Hinweise auf übernommene MIT-Bestandteile
stehen in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
