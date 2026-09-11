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
- Betriebskosten-Wirtschaftspläne für das Folgejahr nach Wohnung, Garage und Grundsteuer erfassen, monatlich umrechnen und drucken
- alle Daten als JSON sichern und transaktional wiederherstellen
- optional PDFs mit OpenAI, Mistral/Mixtral oder einer lokalen Ollama-Instanz
  analysieren und Kosten/Zählerstände nach manueller Prüfung übernehmen
- Papra-Dokumente mit Häusern und Kosten verknüpfen und PDFs direkt aus Papra
  in den KI-Scan übernehmen; die Originaldateien bleiben in Papra

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

## Protokollierung im Docker-Betrieb

Vermietluchs schreibt strukturierte JSON-Zeilen nach stdout/stderr. Damit sind
alle API-Aufrufe in den Container-Logs sichtbar: abgesendete Eingaben,
Einstellungsänderungen, Anlegen/Ändern/Löschen von Datensätzen, Mieterwechsel,
Jahresbuchungen, Abrechnungen, Backup-Import/Export und KI-Aktionen. Schreibaufrufe
erhalten sofort einen Starteintrag und anschließend einen Ergebniseintrag mit
Zeitpunkt (UTC), Request-ID, Methode, Pfad, Client-IP, HTTP-Status und Laufzeit.
Die Request-ID steht auch im Antwortheader `X-Request-Id`. Fehler, Konflikte und
abgebrochene Verbindungen sind als solche gekennzeichnet. Die IP bezeichnet die
direkte Verbindung; hinter einem Proxy ist dies dessen Adresse. Da es keine
Benutzeranmeldung gibt, kann das Log keine Person als Bearbeiter nachweisen.

Nach Installation einer Version mit dieser Funktion:

```bash
# Die noch aufbewahrten Logs anzeigen
docker logs --timestamps vermietluchs

# Die letzten 200 Zeilen anzeigen und neue Aktionen live verfolgen
docker logs --follow --tail 200 --timestamps vermietluchs
```

Die Optionen sind in `.env.example` und `compose.yaml` vorbereitet:

| Variable                  | Standard | Verhalten                                                                                                                                            |
| ------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VERMIETLUCHS_LOG_LEVEL`  | `info`   | Alle API-Aktionen; `debug` zeigt zusätzlich erfolgreiche Healthchecks und statische Aufrufe. `warn`, `error` und `silent` schränken die Ausgabe ein. |
| `VERMIETLUCHS_LOG_VALUES` | `true`   | Abgesendete JSON-Felder, Filter, Revisionen und Ergebnisse von Schreibaufrufen anzeigen; `false` unterdrückt diese Werte.                            |

Änderungen an den Variablen werden nach `docker compose up -d` durch Neuerstellen
des Containers wirksam. Auf einen fest eingestellten alten Image-Tag wie `0.0.9`
hat diese Konfiguration allein keine Wirkung; dafür ist ein neues Image nötig.

Bei aktivierten Werten enthalten die Logs auch eingegebene Namen, Adressen,
Bankverbindungen und Beträge. API-Schlüssel, Passwörter, Tokens und Cookies
werden ausgeblendet. PDF-/Base64-Inhalte werden ausgelassen, Backup-Inhalte
durch Tabellenanzahlen ersetzt und normale Leseantworten nicht nochmals
ausgegeben. Sehr große Werte werden ausdrücklich als `TRUNCATED` gekennzeichnet
(4.000 Zeichen je Text, 100 Einträge je Liste/Objekt, acht Verschachtelungsebenen).
Eingaben werden beim Absenden an den Server erfasst. Noch ungespeicherte
Tastatureingaben, lokale Designwechsel und der Druckdialog im Browser erzeugen
keinen API-Aufruf und damit keinen Server-Logeintrag.

Die mitgelieferte Compose-Datei rotiert die Logs mit fünf Dateien zu je 20 MB.
Ältere Einträge werden dadurch entfernt; beim Entfernen/Ersetzen des Containers
bleiben dessen Logs ebenfalls nicht als dauerhaftes Archiv erhalten. Benötigte
Logs deshalb vor einem Update sichern oder extern sammeln. Die Logs sind ein
Betriebsprotokoll und kein unveränderliches Änderungsarchiv. Frühere Aktionen,
die Version `0.0.9` nicht protokolliert hat, lassen sich damit nicht nachträglich
anzeigen.

## Dokumente aus Papra

Unter **Einstellungen → Papra** die aus dem Vermietluchs-Container erreichbare
Papra-Adresse und einen API-Schlüssel mit `organizations:read` und
`documents:read` hinterlegen und **Verbindung prüfen** auswählen. Anschließend
unter **Stammdaten → Dokumente** für jedes Haus seine Papra-Organisation festlegen.

Unter **Kosten → Belege** und bei den Häusern lassen sich mehrere Dokumente
verknüpfen. PDFs öffnen direkt über Vermietluchs oder werden heruntergeladen.
**KI-Scan → Aus Papra auswählen** lädt ein PDF ohne manuellen Download in die
Analyse. Erst nach Prüfung und Bestätigung werden Kosten angelegt und mit dem
Papra-Original verknüpft. Es werden keine Dokumente in Papra verändert oder gelöscht.

Der Schlüssel liegt separat in `/data/papra-secrets.json` mit Dateirechten 0600.
JSON-Backups enthalten die Zuordnungen, jedoch weder Schlüssel noch Originaldateien.
Nach einem Restore muss die Papra-Verbindung erneut eingerichtet werden.
Ein eigenes Papra-Backup bleibt erforderlich.

Einrichtung, API-Verhalten und Integrationstest: [Papra-Anbindung](docs/PAPRA.md).

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
8. Unter **Wirtschaftsplan** die Vorgaben für das Folgejahr erfassen und die
   festgelegte monatliche Vorauszahlung dokumentieren.

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
- **OpenAI-kompatible API** bietet dieselbe PDF-Eingabe für weitere Modelle:
  Basis-URL einschließlich API-Pfad (z. B. `http://localhost:1234/v1`), Modell-ID
  und bei Bedarf API-Schlüssel eintragen. Der Server muss `/chat/completions`
  unterstützen. Öffentliche Ziele benötigen HTTPS; lokale/private Ziele dürfen
  HTTP verwenden. Gespeicherte Schlüssel sind an die jeweilige API-Adresse gebunden.

Bei Ollama und kompatiblen APIs lassen sich Eingabe und Ausgabe an das Modell
anpassen: **Nur Text** funktioniert mit Textmodellen und PDFs mit Textschicht.
**Automatisch** ergänzt Seiten mit wenig Text durch Bilder; **Alle Seiten als
Bilder** erfasst auch visuelle Tabellen. Beide Bildmodi benötigen ein Modell
mit Bildverständnis. Gescannte PDFs benötigen im Textmodus vorher OCR.
Für die Ausgabe stehen **Striktes JSON-Schema**, **JSON-Modus** und **Nur Prompt**
zur Verfügung. Der Prompt-Modus vermeidet optionale API-Parameter; auch dort
wird die Antwort vollständig validiert. Eine beliebige native Anbieter-API
ohne Chat-Completions-Kompatibilität benötigt einen eigenen Adapter oder ein Gateway.
Das entspricht der Trennung zwischen JSON-Modus und Schema-Ausgabe in der
[OpenAI-Dokumentation](https://developers.openai.com/api/docs/guides/structured-outputs).

Lokale Extraktion und Mistral-OCR verarbeiten höchstens 120.000 Textzeichen;
lokale Bildanalyse höchstens 12 benötigte Seitenbilder. Größere Dokumente
werden mit einem Hinweis zum Aufteilen abgelehnt, nicht still gekürzt.

Nach dem Speichern kann die Verbindung mit dem eingebauten Test geprüft werden.
Bei kompatiblen APIs sendet dieser Test einen kurzen Textaufruf, der beim
Anbieter Kosten verursachen kann. Die PDF- und Formatunterstützung wird erst
beim Scan geprüft.
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
