# Abhängigkeiten

Stand: 30. August 2026. Maßgeblich für reproduzierbare Installationen ist die
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

Der Audit vom 30. August 2026 meldet für die eingecheckte Lockdatei keine
bekannte Schwachstelle.

`@vitest/coverage-v8` ist mit `3.2.7` exakt an die eingesetzte Vitest-Version
gebunden. Diese Linie zieht nur für die Entwicklung noch eine als veraltet
markierte `glob`-Version über `test-exclude` ein; dafür liegt keine bekannte
Sicherheitsmeldung vor. Die transitive Warnung entfällt bei der späteren,
separat zu prüfenden Migration auf Vitest 4.

## Aktualisierungen

Diese neueren Versionen bleiben in der derzeitigen Major-Linie und eignen sich
für einen eigenen, gebündelten Wartungs-Pull-Request:

| Paket                         |     Ist | Kompatible Linie |
| ----------------------------- | ------: | ---------------: |
| `zod`                         | 3.25.67 |          3.25.76 |
| `@vitejs/plugin-react`        |   4.5.2 |            4.7.0 |
| `concurrently`                |   9.1.2 |            9.2.4 |
| `esbuild`                     |  0.25.5 |          0.25.12 |
| `eslint-plugin-react-refresh` |   0.5.4 |            0.5.5 |
| `tsx`                         |  4.20.3 |          4.23.12 |
| `typescript`                  |   5.8.3 |            5.9.3 |

Größere Sprünge auf Zod 4, Vite 8, Vitest 4 und TypeScript 7 sollten in
getrennten Pull Requests mit vollständiger Testausführung erfolgen. Insbesondere
TypeScript 7 ist mit der derzeit erlaubten TypeScript-Linie von
`typescript-eslint` noch nicht kompatibel.

Dependabot überwacht npm, Docker-Basisimages und GitHub Actions wöchentlich.
`npm audit --audit-level=high` ist außerdem Bestandteil jedes CI-Laufs.
