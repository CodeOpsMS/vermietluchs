# Sicherheit

## Unterstützter Betrieb

Vermietluchs ist für genau eine vertrauenswürdige Instanz im privaten Heimnetz
gedacht. Die App besitzt bewusst weder Benutzerkonten noch Anmeldung.

- Keine Router-Portfreigabe für Port 3001 einrichten.
- Keinen öffentlichen Tunnel oder öffentlichen Reverse-Proxy davorschalten.
- Das Heimnetz und den Rechner mit einem sicheren Gerätekennwort schützen.
- Regelmäßig den JSON-Export herunterladen und getrennt aufbewahren.
- Container und Basisimage regelmäßig aktualisieren.

Same-Origin-Prüfung und Browser-Sicherheitsheader erschweren fremde Webaufrufe,
ersetzen aber keine Authentifizierung.

Zugriffe über `localhost` und direkte IP-Adressen sind automatisch erlaubt.
Wird die App über einen eigenen DNS-Namen oder einen privaten Reverse-Proxy
aufgerufen, muss dieser Name ausdrücklich in `VERMIETLUCHS_ALLOWED_HOSTS`
eingetragen werden. Mehrere Namen werden durch Kommas getrennt.

## Optionaler KI-Scan

Der KI-Scan ist nach Installation und Update ausgeschaltet. Bei Aktivierung
gelten zusätzliche Grenzen:

- OpenAI- und Mistral-Zugriffe sind auf die offiziellen HTTPS-API-Adressen
  festgelegt. Eine fremde Cloud-Adresse kann nicht konfiguriert werden.
- Ollama darf nur über `localhost`, `host.docker.internal`, Loopback oder eine
  private LAN-IP angesprochen werden. URL-Zugangsdaten, Pfade und öffentliche
  Ziele werden abgelehnt.
- Cloud-API-Schlüssel stehen nicht in SQLite, Logs, API-Antworten oder
  JSON-Backups. `/data/ai-secrets.json` wird atomar mit Dateimodus `0600`
  geschrieben. Das Docker-Volume selbst muss trotzdem geschützt werden.
- Bei OpenAI oder Mistral verlässt das ausgewählte PDF bewusst den lokalen
  Rechner. Prüfe vorab Berechtigung, Datenschutz und Aufbewahrung beim Anbieter.
- KI-Ausgaben sind nicht vertrauenswürdig. Zod validiert Struktur und Grenzen;
  erst eine ausdrückliche Auswahl im Browser löst einen transaktionalen Import
  aus. Importierbar sind ausschließlich Kosten und Zählerstände.

## Sicherheitsproblem melden

Bitte veröffentliche personenbezogene Beispieldaten oder Sicherheitsdetails
nicht in einem öffentlichen Issue. Melde ein Problem zunächst privat an den
Repository-Eigentümer `CodeOpsMS` über den auf GitHub hinterlegten Kontakt.

Die Meldung sollte eine kurze Reproduktion, betroffene Version und mögliche
Auswirkung enthalten. Echte Mieter-, Adress-, Bank- oder Abrechnungsdaten müssen
vorher vollständig anonymisiert werden.
