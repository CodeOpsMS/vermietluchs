# Fachmodell

Dieses Dokument erklärt die wichtigsten Begriffe der App. Es beschreibt die
implementierte Rechenlogik, ist aber keine Rechtsberatung.

## Häuser, Wohnungen und Mietverhältnisse

Ein Haus (`property`) enthält Wohnungen (`unit`). Eine Wohnung kann im Laufe
der Zeit mehrere Mietverhältnisse (`tenancy`) haben. Deren Zeiträume dürfen
sich nicht überschneiden. Ein Mieterwechsel beendet das bisherige und legt das
folgende Mietverhältnis in einer gemeinsamen Transaktion an.

Eine bestehende Wohnung wird nicht nachträglich in ein anderes Haus und ein
bestehendes Mietverhältnis nicht in eine andere Wohnung verschoben. Das hält
historische Zahlungen, Direktkosten und abgeschlossene Abrechnungen eindeutig.

Wurde das Jahressoll schon vor dem Mieterwechsel erzeugt, entfernt der Wechsel
unbezahlte Folgemonate des bisherigen Mieters automatisch. Bereits gebuchte
Zahlungseingänge nach dem Auszug werden niemals automatisch gelöscht; sie müssen
zuerst im Mietkonto geprüft werden. Eine Monatsbuchung darf nur innerhalb ihres
Mietzeitraums liegen.

Eine Garage wird in der einfachen Version nicht als eigene Wohnung geführt.
Sie ist eine Abrechnungsgruppe und gegebenenfalls ein eigener Anteil der
Vorauszahlung innerhalb desselben Mietverhältnisses.

## Kosten: intern und für den Mieter

Jede Kostenposition bewahrt den Originalbetrag und die interne Bezeichnung auf.
Zusätzlich wird entschieden, was in die Mieterabrechnung gelangt:

- `included`: umlagefähiger Betrag wird verteilt
- `excluded`: bleibt nur in der internen Ansicht
- `pending`: Entscheidung ist noch offen und blockiert den Abschluss

Interne und externe Summe können deshalb bewusst verschieden sein. Die App
verändert diese Entscheidung nie automatisch.

Die Umlagefähigkeit und die Sammelposition sind zwei getrennte Angaben. So
können intern beispielsweise Wasser, Müllabfuhr und Allgemeinstrom einzelne
Kostenpositionen bleiben, in der Mieteransicht aber gemeinsam unter „Wohnung“
erscheinen. Die externe Kostenansicht enthält ausschließlich freigegebene
Positionen; offene Prüffälle bleiben im eigenen Prüfbereich.

## Verteilung

Standardkosten werden für das Kalenderjahr nach dem gewählten Schlüssel
verteilt:

- Fläche: belegte Quadratmeter-Tage
- Personen: Personen-Tage
- Einheiten: Wohnungsgewicht mal Belegungstage
- Direkt: genau eine Wohnung oder ein Mietverhältnis
- Verbrauch: gemessener Verbrauch der passenden Zählerart

Bei `fixedTenancy` ist der eingetragene umlagefähige Betrag bereits der fertige
Anteil eines konkreten Mietverhältnisses. Er wird deshalb nicht noch einmal nach
Tagen gekürzt. Eine Direktzuordnung hat immer genau ein Ziel, damit die
Berechnung eindeutig bleibt.

Wohnung, Garage und Grundsteuer sind die vorbereiteten Sammelpositionen. Für
besondere Fälle können weitere Positionen wie „Aufzug“ angelegt werden. Jede
interne Kostenposition wird zuerst mit ihrem eigenen Schlüssel centgenau
verteilt. Erst danach fasst die Darstellung die fertigen Mieteranteile je
Sammelposition zusammen. Unterschiedliche Verteilungsschlüssel bleiben im
Mieterschreiben als Berechnungshinweis sichtbar.

## Zählerwechsel und Interpolation

Liegt am Beginn oder Ende eines Mietzeitraums eine genaue Ablesung vor, wird sie
verwendet. Fehlt sie, berechnet die App zwischen der vorherigen und nächsten
Ablesung einen linearen Schätzwert. Diese Interpolation erscheint sichtbar als
Warnung in der Vorschau und im Ausdruck.

## Vorauszahlungen und Mietkonto

Das Mietkonto speichert Monats-Soll und tatsächlich bezahlten Betrag getrennt.
Eine Ist-Zahlung wird zusätzlich auf Kaltmiete, Betriebskosten und Garage
aufgeteilt. Für die Abrechnung zählen ausschließlich die tatsächlich gebuchten
Betriebskosten- und Garagenvorauszahlungen im betroffenen Mietzeitraum.
Kaltmiete bleibt im Mietkonto, aber außerhalb der Betriebskostenabrechnung. Gibt
es für das Jahr noch gar keine Mietkontobuchungen, berücksichtigt die Vorschau
0,00 Euro und weist sichtbar auf die fehlenden Zahlungsdaten hin.

Das automatisch erzeugte Jahressoll ist eine Eingabehilfe. Auch bei einem
angefangenen Monat setzt es zunächst den vollen vertraglichen Monatsbetrag an,
weil eine anteilige Miethöhe nicht ohne den konkreten Vertrag entschieden werden
kann. Ein solcher Teilmonat muss bei Bedarf im Mietkonto angepasst werden.

## Betriebskosten-Wirtschaftsplan für das Folgejahr

Der Wirtschaftsplan ist fachlich von den tatsächlichen Kosten und von einer
abgeschlossenen Abrechnung getrennt. Zum oben ausgewählten Abrechnungsjahr zeigt
die App immer das folgende Planjahr. Für jedes in diesem Planjahr aktive
Mietverhältnis kann genau ein Plan gespeichert werden.

Der Plan übernimmt die drei vorbereiteten Sammelpositionen Wohnung, Garage und
Grundsteuer als bereits für das Mietverhältnis bestimmte Jahreswerte. Daraus
berechnet die App den Jahresbetrag und teilt ihn centgenau durch ein bis zwölf
Monate. Eine abweichend festgelegte monatliche Vorauszahlung wird separat
gespeichert und mit dem rechnerischen Monatsbetrag verglichen. Als Eingabehilfe
beginnt sie bei der aktuell im Mietvertrag hinterlegten Betriebs- und
Garagenvorauszahlung.

Ein Wirtschaftsplan ändert weder den Mietvertrag noch bestehende oder künftige
Mietkontobuchungen automatisch. So bleibt eine Erhöhung eine bewusste
vertragliche Entscheidung. Planblatt und Notiz können im Browser gedruckt oder
als PDF gespeichert werden. Wirtschaftspläne sind Bestandteil des JSON-Backups;
ältere Backups ohne Plantabelle bleiben importierbar.

## Rundung

Die Fachberechnung führt alle Geldbeträge als ganzzahlige Centbeträge. Muss ein
Betrag auf mehrere Mietverhältnisse verteilt werden, weist das
Hare-/Größter-Rest-Verfahren auch die letzten Cent deterministisch zu. Die
verteilten Anteile ergeben deshalb immer exakt den zu verteilenden Betrag.

Eine manuelle Rundungsdifferenz gibt es nicht. Die drei früher aus Excel
übernommenen Werte ergeben rechnerisch:

```text
1.102,70 € + 4,99 € + 62,00 € = 1.169,69 €
Vorauszahlungen      1.050,00 €
Nachzahlung            119,69 €
```

## Abschluss

Eine Vorschau kann beliebig oft neu berechnet werden. Ein Abschluss ist erst
möglich, wenn keine Kostenentscheidung mehr `pending` ist. Dabei wird das
vollständige Schreiben einschließlich Vermieter-, Objekt-, Mieter-, Bank- und
Berechnungsdaten als unveränderlicher JSON-Snapshot gespeichert. Künftige
Änderungen an Namen, Kosten, Zahlungen oder Zählerständen verändern diesen
Snapshot nicht.

Jede Vorschau enthält eine Prüfsumme ihrer Eingaben und Ergebnisse. Haben sich
Kosten, Zahlungen oder Stammdaten bis zum Abschluss geändert, lehnt der Server
den Abschluss ab und verlangt eine neue Vorschau. So wird genau der geprüfte
Stand gespeichert.

Soll ein Abschluss berichtigt werden, wird er ausdrücklich „zur Korrektur
geöffnet“. Während die neue Vorschau geprüft wird, bleibt der alte Snapshot
unverändert erhalten. Erst der erneute Abschluss ersetzt ihn atomar und erhöht
seine Revision. Vorher empfiehlt die Oberfläche zusätzlich ein JSON-Backup.

Bei einem Mietverhältnis, das nicht das ganze Jahr umfasst, wird keine
automatische monatliche Vorauszahlung für das Folgejahr vorgeschlagen.
