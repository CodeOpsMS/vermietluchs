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

Wohnung, Garage und Grundsteuer sind die vorbereiteten Abrechnungsgruppen. Für
besondere Fälle können weitere Gruppen wie „Aufzug“ angelegt werden.

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

## Rundung

Intern rechnet die Fachlogik präzise und rundet Geldbeträge auf Cent. Eine aus
einer extern vorgegebenen Gesamtsumme bekannte Differenz wird im
Abrechnungsdialog ausdrücklich eingegeben. Sie wird nicht heimlich auf eine
Position aufgeschlagen, sondern als `Rundungsdifferenz` ausgewiesen. Beispiel:

```text
Umlagefähige Kosten  1.169,70 €
Vorauszahlungen      1.050,00 €
Nachzahlung            119,70 €
```

## Abschluss

Eine Vorschau kann beliebig oft neu berechnet werden. Ein Abschluss ist erst
möglich, wenn keine Kostenentscheidung mehr `pending` ist. Dabei wird das
vollständige Schreiben einschließlich Vermieter-, Objekt-, Mieter-, Bank- und
Berechnungsdaten als unveränderlicher JSON-Snapshot gespeichert. Künftige
Änderungen an Namen, Kosten, Zahlungen oder Zählerständen verändern diesen
Snapshot nicht.

Bei einem Mietverhältnis, das nicht das ganze Jahr umfasst, wird keine
automatische monatliche Vorauszahlung für das Folgejahr vorgeschlagen.
