# Papra-Anbindung

Die Integration verwendet die REST-Schnittstellen von Papra 26.6.1, geprüft
gegen Commit `34195e0177eda7985ed9c8c270b5a6a9d8716ea0`. Originale bleiben in
Papra; Vermietluchs speichert nur Quellenreferenzen und Dateimetadaten.

## Einrichtung und Verwendung

1. In Papra einen API-Schlüssel mit `organizations:read` und `documents:read`
   anlegen. Vermietluchs verwendet ausschließlich GET-Aufrufe zu Papra.
2. Unter Einstellungen → Papra Adresse und Schlüssel speichern und die
   Verbindung prüfen. Die Adresse muss aus dem Container erreichbar sein;
   `localhost` bezeichnet innerhalb eines Containers diesen Container selbst.
   Bei einer internen Docker-Adresse wie `http://papra:1221` zusätzlich die
   **Papra-Adresse im Browser** eintragen, etwa `https://papra.example.org`.
   Nur die interne API-Adresse erhält den Schlüssel. Beide Container müssen
   für den Docker-Namen im selben Docker-Netz liegen.
3. Unter Stammdaten → Dokumente → Papra-Organisation für dieses Haus die
   gewünschte Organisation laden, auswählen und speichern.
4. Dokumente beim Haus oder über Kosten → Belege verknüpfen. Mehrere Belege pro
   Ziel und dasselbe Dokument an mehreren Kosten sind möglich. Entfernen einer
   Verknüpfung oder eines lokalen Datensatzes löscht kein Papra-Original.
5. Für den KI-Scan ein Papra-PDF auswählen und ausdrücklich analysieren.
   Nach fachlicher Prüfung werden alle neu angelegten Kosten automatisch mit
   diesem Original verknüpft. Zählerstände erhalten keine Belegzuordnung.

Die Dokumentauswahl unterstützt die Papra-Suchsyntax und Seiten mit 20 Einträgen.
PDFs bis 20 MiB können gescannt werden. Andere Dateiformate lassen sich verknüpfen
und herunterladen. PDF-Anzeige und Downloads laufen durch Vermietluchs und
benötigen keine zusätzliche Papra-Sitzung. Der ergänzende Link „In Papra öffnen“
verwendet die normale Papra-Anmeldung.

## Speicherung und Fehlerverhalten

Migration 005 ergänzt `papra_settings`, `papra_property_mappings` und
`document_links`. Eine Verbindung gilt erst nach erfolgreichem Test als nutzbar.
API-Schlüssel liegen ausschließlich in einer atomar geschriebenen Datei
`papra-secrets.json` im Datenverzeichnis (0600), gebunden an die konfigurierte
Adresse. Ein Adresswechsel entfernt den bisherigen Schlüssel, sofern kein neuer
eingetragen wird. API-Antworten und Logs enthalten keine Schlüssel oder PDF-Inhalte.

Neue Auswahlen werden gegen Haus, Organisation und Konfigurationsrevisionen
geprüft. Eine Änderung während eines Abrufs verwirft das Ergebnis. Bestehende
Links behalten ihre Instanz, Organisation und Dokument-ID. Bei Umzuordnung zu
einer anderen Organisation bleiben sie erreichbar, soweit der Schlüssel weiter
Zugriff auf ihre ursprüngliche Organisation hat. Eine andere Instanz kann die
Quelle nicht stillschweigend ersetzen.

Papra-Ausfälle beeinträchtigen weder gewöhnliche Kostenänderungen noch
Abrechnungen. Lokale Links bleiben sichtbar. Fehlgeschlagene Importe erhalten
den bearbeiteten Entwurf. Der Import von Kosten, Zählerständen und Links ist eine
einzige Transaktion. Dokumentlinks beeinflussen keine Beträge oder Snapshots.

Papra liefert Originale mit `application/octet-stream`; Vermietluchs prüft für
PDFs die Metadaten und Dateisignatur. Vor einem KI-Scan werden zusätzlich die
tatsächlich übertragenen Bytes, SHA-256 und PDF-Lesbarkeit geprüft. Dateiabrufe
folgen keinen Weiterleitungen mit dem Bearer-Schlüssel und haben ein Zeitlimit.
Binärdateien und extrahierte Texte werden nicht dauerhaft lokal gespeichert.

Backups werden als Version 2 exportiert und enthalten Einstellungen, Zuordnungen
und Links. Alte Version-1-Backups bleiben importierbar. Wiederherstellungen
benötigen keinen Papra-Zugriff und setzen die Verbindung samt Schlüssel zurück.
Originaldateien müssen über Papra gesichert werden.

## Schnittstellen

| Vermietluchs-Endpunkt                                     | Zweck                                                                             |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `GET/PUT /api/papra/settings`, `POST /api/papra/test`     | Einrichtung, Schlüsselstatus, Verbindungstest                                     |
| `GET /api/papra/organizations`                            | Mit dem Schlüssel zugängliche Organisationen                                      |
| `GET/PUT /api/properties/:id/papra`                       | Organisationszuordnung für ein Haus                                               |
| `GET /api/properties/:id/papra/documents?search=…&page=…` | Suche innerhalb der Hausorganisation                                              |
| `GET /api/properties/:id/papra/file`                      | Datei einer validierten Auswahl; optional `download=1` oder `check=1`             |
| `GET/POST /api/document-links`                            | Lokale Links je `propertyId` und optional `costId`; Anlegen mit geprüfter Auswahl |
| `DELETE /api/document-links/:id?propertyId=…`             | Nur die lokale Zuordnung entfernen                                                |
| `GET /api/document-links/:id/file?propertyId=…`           | Original abrufen; optional `download=1` oder `check=1`                            |
| `POST /api/ai/scan/papra`                                 | PDF serverseitig laden und scannen                                                |
| `POST /api/ai/import`                                     | Bestehender Import, ergänzt um optionale `papraSource`                            |

Auswahldaten und Quellenreferenzen sind in `src/shared/papra.ts` definiert.
Instanzadressen für Dokumentabrufe kommen ausschließlich aus der gespeicherten
Verbindung, nie aus beliebigen Client-Parametern oder restaurierten Links.

## Tests

`tests/papra-client.test.ts` und `tests/papra.test.ts` prüfen HTTP-Vertrag,
Schlüssel, Rechte, Hausgrenzen, Manipulation, Dateigrenzen, unveränderte Bytes,
Fehlerfälle, atomaren Import und Backup-Kompatibilität. Die Migration wird mit
einer bestehenden Schema-4-Datenbank geprüft.

`tests/e2e/papra-integration.spec.ts` verwendet einen echten lokalen HTTP-Dienst
mit Papra-Antworten und einem deterministischen KI-Anbieter. Die Tests decken
Einrichtung, zwei Hausorganisationen, Suche, Pagination, PDF-Anzeige, Download,
mehrere Links, KI-Import, Fehler, Hauswechsel und mobile Bedienung ab. Für die
PDF-Anzeige wird der vollständige Chromium-Browser mit PDF-Betrachter verwendet.

Der wiederholbare Praxistest `scripts/run-papra-check.ts` akzeptiert über stdin
ein JSON-Objekt mit `baseUrl`, `apiKey`, `organizationId` und `documentId`:

```bash
npx tsx scripts/run-papra-check.ts < /geschuetzt/papra-test.json
```

Die Eingabedatei gehört außerhalb des Repositorys in einen geschützten Bereich.
Alternativ kann ein Passwortmanager die Eingabe direkt über stdin liefern.
Schlüssel nicht als Kommandozeilenargument verwenden. Der Test benötigt den
aktuellen Quellstand, seine Abhängigkeiten und Migrationen. Ein anderer
Migrationsordner kann über `PAPRA_CHECK_MIGRATIONS_DIR` angegeben werden.

Er legt eine Datenbank nur im Arbeitsspeicher an, verwendet einen simulierten
KI-Anbieter, prüft echte Papra-Abrufe, Scan, Import, Links und SHA-256 vor/nach
Entfernung der Links. Dokumentinhalte werden nicht an einen KI-Dienst gesendet.
Der Produktionsdatenbestand bleibt unberührt. Die Ausführung dieses Prüfablaufs
gegen einen lokalen Testdienst ist selbst Teil der automatisierten Testsuite.

### Praxistest vom 11. September 2026

Der Prüfablauf wurde aus dem vorhandenen Vermietluchs-Container gegen die
installierte Papra-Version 26.6.1 erfolgreich ausgeführt: Dokumentensuche,
Abruf eines 951.583 Byte großen PDFs, Scan mit simuliertem KI-Anbieter,
Import von zwei Testkosten, Belegzuordnung, Download und Entfernen der Links.
Das Papra-Original hatte danach dieselbe SHA-256-Prüfsumme. Die Testdatenbank
lag ausschließlich im Arbeitsspeicher; temporärer Leseschlüssel und Testdateien
wurden anschließend entfernt.

Der Praxistest bestätigte die getrennte Verwendung einer internen Docker-Adresse
für API-Aufrufe und einer vom Browser erreichbaren Adresse für Papra-Links.
Die produktive Vermietluchs-Installation wurde bei diesem Test weder aktualisiert
noch neu konfiguriert.
