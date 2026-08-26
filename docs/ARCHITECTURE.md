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
