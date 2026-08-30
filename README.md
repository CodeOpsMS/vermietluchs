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
- optional PDFs mit OpenAI, Mistral/Mixtral oder einer lokalen Ollama-Instanz
  analysieren und Kosten/Zählerstände nach manueller Prüfung übernehmen

## Schnellstart mit Docker

Voraussetzung ist Docker Desktop oder Docker Engine mit Compose.

```bash
git clone https://github.com/CodeOpsMS/vermietluchs.git
cd vermietluchs
docker compose up -d
```

Danach öffnest du `http://localhost:3001`. Die SQLite-Datenbank und
Sicherheitskopien liegen dauerhaft im Docker-Volume `vermietluchs-data`.
Von einem anderen Gerät im selben vertrauenswürdigen Netz verwendest du
`http://IP-DEINES-RECHNERS:3001`.

Compose lädt standardmäßig das aktuelle Image aus GitHub Packages. Eine
bestimmte Version lässt sich reproduzierbar festhalten:

```bash
VERMIETLUCHS_VERSION=0.0.1 docker compose up -d
```

Falls das GitHub-Container-Package noch privat ist, musst du dich vor dem
ersten Start mit einem Token mit `read:packages` anmelden:

```bash
docker login ghcr.io -u CodeOpsMS
```

Container stoppen:

```bash
docker compose down
```

Vor einem Update empfiehlt sich zusätzlich ein JSON-Export unter
**Einstellungen → Datensicherung**.

Danach wird das aktuelle Image so geladen und der Container neu erstellt:

```bash
docker compose pull
docker compose up -d
```

## Releases und Container-Paket

Nach jedem erfolgreich geprüften Merge eines Pull Requests nach `main` erzeugt
GitHub Actions automatisch die nächste Patch-Version. Die erste Version ist
`v0.0.1`, danach folgen `v0.0.2`, `v0.0.3` und so weiter. Zum gleichen Stand
werden ein GitHub Release und ein Linux-Container für AMD64 und ARM64 unter
`ghcr.io/codeopsms/vermietluchs` veröffentlicht.

Verfügbare Image-Tags sind die exakte Version (`0.0.1` und `v0.0.1`), `latest`
und ein unveränderlicher Commit-Tag. Der Workflow lässt sich für den aktuellen
Stand auch manuell starten und bleibt dabei versionsstabil. Ein direkter Push
auf `main` veröffentlicht kein Release.

GitHub legt das Package beim ersten Lauf standardmäßig privat an. Soll das Image
ohne Anmeldung ladbar sein, muss dessen Sichtbarkeit einmalig in den
Package-Einstellungen auf **Public** gestellt werden.

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

`npm run check` prüft Formatierung, TypeScript, Stilregeln, alle Vitest-Tests,
Coverage-Mindestwerte und den Produktions-Build. Der ausführliche lokale
Coverage-Bericht liegt anschließend unter `coverage/index.html`.
`npm run test:e2e` startet zusätzlich eine isolierte temporäre Datenbank und
klickt die wichtigsten Buttons und Zahlen in einem echten Chromium-Browser
durch. Beim ersten lokalen Lauf wird Chromium mit
`npx playwright install chromium` installiert. Die GitHub-Pipeline führt beide
Prüfungen automatisch aus und speichert den Coverage-Bericht 14 Tage als
Artefakt. Details und die geltenden Grenzwerte stehen in
[docs/TESTING.md](docs/TESTING.md).

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

## Optionaler KI-Scan

Der KI-Scan ist standardmäßig ausgeschaltet. Unter **Einstellungen → KI-Scan**
wählst du einen der unterstützten Wege:

- **Ollama** arbeitet über eine lokale Instanz. Beim Docker-Betrieb ist als
  Adresse häufig `http://host.docker.internal:11434` passend; alternativ wird
  eine private LAN-IP akzeptiert. Die mitgelieferte Compose-Datei richtet den
  Hostnamen auch unter Linux über das Docker-Host-Gateway ein.
- **OpenAI** verwendet ausschließlich `https://api.openai.com/v1`.
- **Mistral / Mixtral** verwendet ausschließlich
  `https://api.mistral.ai/v1`; das konkrete Auswertungsmodell bleibt wählbar.

Nach dem Speichern kann die Verbindung mit dem eingebauten Test geprüft werden.
Erst bei aktivierter Funktion erscheint **KI-Scan** in der Navigation. Dort
werden PDFs bis 20 MB analysiert. Das Ergebnis ist immer nur ein bearbeitbarer
Entwurf: Du wählst Kosten und Zählerstände einzeln aus und ordnest erkannte
Zähler einem bereits vorhandenen Zähler zu. Kosten werden als offene
Prüfentscheidung angelegt. Die KI erzeugt niemals Mieter, Mietverhältnisse,
Zahlungen oder Abrechnungen.

API-Schlüssel liegen mit Dateirechten `0600` in `/data/ai-secrets.json`. Sie
werden weder über die API zurückgegeben noch in der SQLite-Datenbank oder im
JSON-Backup gespeichert. Wer ein Backup auf einem neuen System einspielt, muss
den Schlüssel deshalb neu hinterlegen.

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
[docs/DOMAIN.md](docs/DOMAIN.md). Eine Übersicht der Laufzeit-, Entwicklungs-
und Betriebsabhängigkeiten steht in [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).
Die Ergebnisse des vollständigen Reviews sind in
[docs/CODE_REVIEW.md](docs/CODE_REVIEW.md) dokumentiert. Hinweise zum sicheren
Betrieb findest du in [SECURITY.md](SECURITY.md). Die Teststrategie und
Coverage-Grenzen beschreibt [docs/TESTING.md](docs/TESTING.md).

## Konfiguration

Im Container sind die passenden Werte bereits gesetzt. Beim lokalen Start
können diese Umgebungsvariablen angepasst werden:

| Variable                     | Standard    | Bedeutung                                    |
| ---------------------------- | ----------- | -------------------------------------------- |
| `VERMIETLUCHS_PORT`          | `3001`      | HTTP-Port                                    |
| `VERMIETLUCHS_HOST`          | `127.0.0.1` | lokale Bind-Adresse                          |
| `VERMIETLUCHS_DATA_DIR`      | `./data`    | Ordner für SQLite und Sicherheitskopien      |
| `VERMIETLUCHS_ALLOWED_HOSTS` | leer        | zusätzliche DNS-Namen, durch Kommas getrennt |
| `VERMIETLUCHS_VERSION`       | `latest`    | von Docker Compose zu ladender Container-Tag |

Nur der Docker-Start setzt den Host bewusst auf `0.0.0.0`, damit Geräte im
vertrauenswürdigen Heimnetz die App erreichen können. Zugriffe per IP-Adresse
und `localhost` sind automatisch erlaubt. Für einen Namen wie `nas.example.lan`
setzt du `VERMIETLUCHS_ALLOWED_HOSTS=nas.example.lan`.

## Datenschutz und Verantwortung

Ohne aktivierten KI-Scan bleiben alle Fachdaten lokal; Vermietluchs nutzt keine
Telemetrie. Bei Ollama bleibt die Verarbeitung bei der konfigurierten lokalen
Instanz. Bei OpenAI oder Mistral wird das ausgewählte PDF bewusst an den
jeweiligen Cloud-Anbieter übertragen. Dessen Datenschutz- und
Aufbewahrungsregeln gelten. Prüfe KI-Ergebnisse und Betriebskostenabrechnungen
immer fachlich und rechtlich; Vermietluchs ersetzt keine Rechts- oder
Steuerberatung.

## Lizenz

Der Code ist **source-available und nichtkommerziell** unter der
[PolyForm Noncommercial License 1.0.0](LICENSE.md) verfügbar. Das ist bewusst
keine Open-Source-Lizenz im engeren Sinn. Hinweise auf übernommene MIT-Bestandteile
stehen in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
