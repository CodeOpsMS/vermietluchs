# Architektur

Vermietluchs besteht aus einem Node-Prozess und einer SQLite-Datei. Im
Produktionsbetrieb liefert Express sowohl die JSON-API als auch die gebaute
React-Oberfläche aus. Dadurch sind nur ein Container, ein Port und ein
Datenordner nötig.

## Datenfluss

```text
Browser (React)
      │  /api, gleiche Herkunft
      ▼
Express-Routen ── Zod-Prüfung ── kleine Repository-Funktionen
      │                                  │
      │                                  ▼
      └──── reine Abrechnungslogik     SQLite
                  │
                  ▼
          Abrechnungsvorschau / vollständiger Snapshot
```

Der optionale KI-Pfad ist davon bewusst getrennt:

```text
PDF → /api/ai/scan → Provideradapter → prüfbarer Entwurf im Browser
                                           │
                                           └─ ausdrückliches Übernehmen
                                                      │
                                                      ▼
                                      Transaktion: Kosten + Zählerstände
```

OpenAI und Mistral erhalten die PDF-Datei direkt über ihre fest verdrahteten
offiziellen HTTPS-Endpunkte. Ollama und OpenAI-kompatible Chat-APIs teilen sich
die lokale PDF-Aufbereitung und denselben Extraktionsprompt mit JSON-Schema.
Text-, Automatik- und Bildmodus sowie Schema-, JSON- und Prompt-Ausgabe sind
konfigurierbar. Bei gemischten PDFs prüft die Automatik jede Seite einzeln;
Text-/Bildgrenzen führen zum Abbruch statt zu unvollständigen Entwürfen. Die einheitliche,
serverseitig validierte Antwort enthält keine Mieter-, Zahlungs- oder
Abrechnungsobjekte.

Kompatible Endpunkte unterstützen freie Modell-IDs und optionale Bearer-Schlüssel.
Schlüssel werden unter `compatible:<normalisierte Basis-URL>` gespeichert;
ein Adresswechsel übernimmt keine Zugangsdaten des vorherigen Ziels.
Verbindungstests nutzen ausschließlich die gespeicherte Konfiguration.

Migration `002` bleibt dem veröffentlichten Wirtschaftsplan vorbehalten; `003`
ergänzt den KI-Scan, `004` die kompatible API und Eingabe-/Ausgabemodi. Nur der
bekannte Vorabstand `002_ai_scan.sql` wird beim Upgrade auf `003_ai_scan.sql`
umgeordnet, sodass vorhandene KI-Einstellungen erhalten bleiben. Andere
umbenannte oder doppelte Migrationen bleiben Fehler.

## Warum diese Werkzeuge?

- **React und Vite** halten die Bedienoberfläche komponentenbasiert, ohne ein
  großes Framework vorzuschreiben.
- **Express** bildet HTTP-Routen sehr direkt ab. Jede Route ist einzeln lesbar.
- **Zod** prüft Eingaben an der API-Grenze. Dieselben Regeln liefern auch
  TypeScript-Typen.
- **better-sqlite3** arbeitet synchron. Für diese einzelne Heimnetz-Instanz ist
  der Ablauf einfacher zu verstehen und ausreichend schnell.
- **SQLite** braucht keinen zweiten Server und lässt sich durch Kopieren der
  Datei oder per JSON-Export sichern.
- **pdf-parse** liest Text und rendert bei Bedarf Seiten für die lokale
  Ollama-Verarbeitung. Cloud-Anbieter erhalten das Original-PDF ohne lokale
  Zwischenablage.

## Schichten

`src/client` kennt nur HTTP und Darstellungszustand. Fachberechnungen finden
nicht in React-Komponenten statt.

`src/server/routes` übersetzt HTTP-Anfragen in konkrete Funktionsaufrufe. Die
Routen enthalten keine komplizierte Verteilungsrechnung.

`src/server/database.ts` öffnet die Datenbank und führt nummerierte Migrationen
aus. Explizite Abfragen stehen bei den jeweiligen Routen. Fremdschlüssel,
eindeutige Indizes und Transaktionen sichern die wichtigsten Regeln zusätzlich
ab.

`src/domain` ist unabhängig von Express und SQLite. Die Berechnung erhält ein
vollständiges Eingabeobjekt und liefert ein Ergebnisobjekt. Dadurch lässt sie
sich mit vielen kleinen Beispielen testen.

## Gleichzeitige Bearbeitung

Veränderbare Datensätze besitzen eine `revision`. Bei einer Änderung muss der
Browser die gelesene Revision mitsenden. Hat inzwischen ein anderes Gerät den
Datensatz geändert, antwortet die API mit HTTP 409. Die Oberfläche lädt dann
neu, statt die neuere Änderung still zu überschreiben.

## Sicherheit im Heimnetz

Es gibt keine Anmeldung. Schreibende Requests werden nur von derselben Herkunft
akzeptiert; CORS ist nicht aktiviert. Das schützt gegen einige versehentliche
Browser-Aufrufe, ersetzt aber keine Authentifizierung. Der Container darf daher
nicht über Router-Portfreigaben, öffentliche Reverse-Proxys oder Tunnel ins
Internet gestellt werden.

Abgeschlossene Abrechnungen sind eine Ausnahme vom üblichen Stammdatenfluss:
Der Snapshot enthält das komplette, damals sichtbare Schreiben. Beim erneuten
Öffnen wird nicht neu gerechnet und es werden keine aktuellen Anschriften oder
Bankdaten hineingemischt.

## Datenbankänderungen

Migrationen liegen nummeriert in `migrations/`. Beim Start werden nur noch nicht
angewendete Dateien innerhalb einer Transaktion ausgeführt. Eine bestehende
Migration wird nicht nachträglich geändert; stattdessen kommt eine neue Datei
dazu.

Nicht geheime KI-Konfiguration liegt in der separaten Tabelle `ai_settings`.
Provider-Schlüssel liegen außerhalb von SQLite in `ai-secrets.json` mit Modus
`0600`. KI-Einstellungen und Schlüssel sind absichtlich nicht Teil des
portablen JSON-Fachdatenbackups.
