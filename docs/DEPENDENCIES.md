# Abhängigkeiten

Stand: 7. September 2026. Maßgeblich für reproduzierbare Installationen ist die
eingecheckte `package-lock.json`; alle direkten Versionen sind exakt festgelegt.

## Laufzeit und Datenfluss

```text
Browser
  └─ React 19 → REST/JSON
                 └─ Express 5 → Zod 3 → Fachlogik
                                             └─ better-sqlite3 13 → SQLite-Datei
                 └─ optionaler KI-Scan → OpenAI / Mistral / lokales Ollama
```

| Paket                | Version | Aufgabe                                            |
| -------------------- | ------: | -------------------------------------------------- |
| `react`, `react-dom` |  19.2.8 | Browser-Oberfläche und DOM-Rendering               |
| `express`            |   5.2.1 | HTTP-API und Auslieferung des gebauten Clients     |
| `zod`                | 3.25.67 | Validierung gemeinsamer API-Eingaben und Snapshots |
| `better-sqlite3`     |  13.0.3 | Synchroner, nativer Zugriff auf SQLite             |
| `pdf-parse`          |   2.4.5 | Lokale PDF-Text- und Seitenextraktion für Ollama   |

Der Produktionscontainer benötigt Node.js 24, Linux und ein beschreibbares
Volume unter `/data`. Es gibt keine externe Datenbank oder Telemetrie. Nur bei
bewusst aktiviertem OpenAI- oder Mistral-Scan besteht eine
Cloud-Laufzeitabhängigkeit; Ollama kann vollständig lokal laufen.

## Entwicklungs- und Build-Werkzeuge

- TypeScript und `typescript-eslint` prüfen Typen und Quelltext.
- Vite und das React-Plugin bauen die Browser-Anwendung.
- esbuild bündelt den Express-Server.
- Vitest, der passende V8-Coverage-Provider und Supertest prüfen Fachlogik,
  Client-Helfer, API und SQLite-Persistenz.
- Playwright prüft den vollständigen Ablauf in Chromium.
- Prettier, ESLint und die React-Lint-Plugins erzwingen den Stil.
- Docker Buildx erzeugt die Linux-Images für AMD64 und ARM64.

`npm audit --json` erfasst 466 Abhängigkeiten insgesamt: 76 für die Produktion,
379 für die Entwicklung und 91 optionale beziehungsweise plattformabhängige
Abhängigkeiten; die Kategorien können sich überschneiden. Der Audit vom 7. September 2026 meldet nach der gezielten Aktualisierung von `qs` auf 6.16.0
keine bekannte Schwachstelle. Das ist eine zeitabhängige Prüfung der
Abhängigkeiten, keine Sicherheitsgarantie für die gesamte Anwendung.

Die zuvor festgeschriebene Version `qs` 6.15.3 war von zwei moderaten Meldungen betroffen:
[GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx) und
[GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g).
Das Update auf `qs` 6.16.0 ist durch den KI-Scan-Merge (PR #19) bereits in
`main` enthalten. Der aktualisierte Sicherheits-Branch verändert die Lockdatei
gegenüber diesem Main daher nicht mehr; die PDF-Abhängigkeiten bleiben erhalten.
Eine Ausnutzung über die konkrete
Vermietluchs-Konfiguration wurde nicht nachgewiesen.

`@vitest/coverage-v8` ist mit `3.2.7` exakt an die eingesetzte Vitest-Version
gebunden. Diese Linie zieht nur für die Entwicklung noch eine als veraltet
markierte `glob`-Version über `test-exclude` ein; dafür liegt keine bekannte
Sicherheitsmeldung vor. Die transitive Warnung entfällt bei der späteren,
separat zu prüfenden Migration auf Vitest 4.

## Aktualisierungen

Die früher hier aufgeführte Upgrade-Tabelle ist durch inzwischen gemergte
Dependabot-Updates überholt. Installierte Versionen werden mit `npm ls --depth=0`,
neue verfügbare Versionen mit `npm outdated` geprüft. Maßgeblich bleiben
`package.json` und `package-lock.json`.

Major-Upgrades benötigen einen eigenen Branch mit Prüfung der Peer-Abhängigkeiten,
`npm run check`, `npm run test:e2e` und den Container-Smoke-Tests. Sie sind nicht
Teil der gezielten Sicherheitskorrektur dieses Reviews.

Dependabot überwacht npm, Docker-Basisimages und GitHub Actions wöchentlich.
`npm audit --audit-level=high` ist außerdem Bestandteil jedes CI-Laufs.
Alle verwendeten GitHub Actions sind jetzt auf vollständige Commit-SHAs gepinnt;
der Versionskommentar dokumentiert den aufgelösten Stand. Die Release-Logik und
die bestehende Audit-Abbruchschwelle bleiben unverändert.
