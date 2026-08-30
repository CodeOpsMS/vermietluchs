import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import SettlementActions from '../src/client/pages/settlement/SettlementActions';
import { createTenantStatementGroups } from '../src/client/pages/settlement/settlement-groups';
import SettlementPaper from '../src/client/pages/settlement/SettlementPaper';
import type { SettlementPreview } from '../src/client/types';

const preview: SettlementPreview = {
  propertyId: 1,
  tenancyId: 1,
  year: 2024,
  propertyName: 'Demohaus',
  propertyAddress: 'Musterstraße 10, 12345 Musterstadt',
  landlordName: 'Manfred Lämmerzahl',
  landlordAddress: 'Fridtjof-Nansen-Straße 10, 44225 Dortmund',
  bankAccountHolder: 'Manfred Lämmerzahl',
  bankIban: 'DE00123456789012345678',
  paymentDeadlineDays: 10,
  unitName: 'Wohnung 1',
  tenantName: 'Demo Mieter',
  tenantAddress: 'Alte Adresse 1, 12345 Musterstadt',
  periodStart: '2024-01-01',
  periodEnd: '2024-07-31',
  days: 213,
  isPartialYear: true,
  notes: [],
  rows: [
    {
      id: 1,
      description: 'Interne Wasserrechnung',
      statementGroup: 'Wohnung',
      allocationLabel: 'Fester Mieteranteil',
      sourceAmount: 600,
      allocableAmount: 600,
      tenantShare: 600,
      labor35a: 0,
      allocationRounding: 0.01,
      isRoundingDifference: false,
    },
    {
      id: 2,
      description: 'Interne Müllrechnung',
      statementGroup: 'Wohnung',
      allocationLabel: '47,46 von 100,00 m² Wohnfläche',
      sourceAmount: 600.7,
      allocableAmount: 502.7,
      tenantShare: 502.7,
      labor35a: 0,
      allocationRounding: 0,
      isRoundingDifference: false,
    },
  ],
  totalTenantShare: 1102.7,
  totalPrepayments: 1050,
  utilityPrepayments: 1050,
  garagePrepayments: 0,
  prepaymentsByGroup: { Wohnung: 1050 },
  balance: 52.7,
  labor35a: 0,
  roundingDifference: 0,
  warnings: [],
  blockingReasons: [],
  canClose: true,
  closed: true,
  closedAt: '2026-08-26T09:00:00.000Z',
  snapshotId: 1,
};

describe('Schlichte Abrechnungs-Druckansicht', () => {
  test('zeigt Geschäftsdaten ohne App-Logo, Status oder technische Snapshot-Angaben', () => {
    const html = renderToStaticMarkup(<SettlementPaper preview={preview} />);

    expect(html).toContain('Manfred Lämmerzahl');
    expect(html).toContain('Fridtjof-Nansen-Straße 10, 44225 Dortmund');
    expect(html).toContain('Demo Mieter');
    expect(html).toContain('Alte Adresse 1, 12345 Musterstadt');
    expect(html).toContain('Vermieter');
    expect(html).toContain('Empfänger');
    expect(html).toContain('Betriebskostenabrechnung');
    expect(html).toContain('Kontoinhaber');
    expect(html).not.toMatch(/vermietluchs|abgeschlossen|prüfvorschau/i);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('Snapshot');
    expect(html).not.toContain('Rundung');
  });

  test('fasst interne Einzelkosten zu genau einer Mieterposition zusammen', () => {
    const groups = createTenantStatementGroups(preview.rows);
    const html = renderToStaticMarkup(<SettlementPaper preview={preview} />);

    expect(groups).toEqual([
      {
        name: 'Wohnung',
        sourceAmount: 1200.7,
        allocableAmount: 1102.7,
        tenantShare: 1102.7,
        allocationLabels: ['Fester Mieteranteil', '47,46 von 100,00 m² Wohnfläche'],
        isLegacyRounding: false,
      },
    ]);
    expect(groups.reduce((sum, group) => sum + group.tenantShare, 0)).toBe(
      preview.totalTenantShare,
    );
    expect(html).toContain('Sammelposition');
    expect(html).toContain('Verteilung:');
    expect(html).toContain('Fester Mieteranteil');
    expect(html).toContain('47,46 von 100,00 m² Wohnfläche');
    expect(html).toContain('Gesamt');
    expect(html).not.toContain('Interne Wasserrechnung');
    expect(html).not.toContain('Interne Müllrechnung');
  });

  test('druckt deutsche Datumsangaben und keine Warnungen über fehlende Zählerabdeckung', () => {
    const html = renderToStaticMarkup(
      <SettlementPaper
        preview={{
          ...preview,
          notes: [
            'Teiljahresabrechnung 2024-08-01 bis 2024-12-31 (153/366 Tage).',
            'Für ein Teiljahr wird keine automatische 1/12-Empfehlung zur Vorauszahlung berechnet.',
          ],
          warnings: [
            'Zähler „Wärmezähler F“: Der Zeitraum 2024-01-01 bis 2024-12-31 ist nicht vollständig durch Ablesungen abgedeckt.',
            'Bitte den Wert vom 2024-12-31 fachlich prüfen.',
          ],
        }}
      />,
    );

    expect(html).not.toContain('Wärmezähler F');
    expect(html).not.toContain('nicht vollständig durch Ablesungen abgedeckt');
    expect(html).toContain('Teiljahresabrechnung 01.08.2024 bis 31.12.2024');
    expect(html).toContain('Bitte den Wert vom 31.12.2024 fachlich prüfen.');
    expect(html).not.toContain('2024-08-01');
    expect(html).not.toContain('2024-12-31');
  });

  test('bietet den PDF-Druck nur für einen abgeschlossenen Stand an', () => {
    const callbacks = {
      onPrint: () => undefined,
      onCorrect: () => undefined,
      onClose: () => undefined,
    };
    const closedActions = renderToStaticMarkup(
      <SettlementActions preview={preview} busy={false} {...callbacks} />,
    );
    const openActions = renderToStaticMarkup(
      <SettlementActions
        preview={{ ...preview, closed: false, closedAt: null, snapshotId: null }}
        busy={false}
        {...callbacks}
      />,
    );

    expect(closedActions).toContain('Drucken / PDF');
    expect(closedActions).toContain('Zur Korrektur öffnen');
    expect(openActions).not.toContain('Drucken / PDF');
    expect(openActions).toContain('Abrechnung abschließen');
  });

  test('macht einen alten Excel-Ausgleich sichtbar und sperrt dessen PDF-Druck', () => {
    const legacyPreview: SettlementPreview = {
      ...preview,
      rows: [
        ...preview.rows,
        {
          id: null,
          description: 'Rundungsdifferenz',
          statementGroup: 'Wohnung',
          allocationLabel: 'Alter Excel-Ausgleich',
          sourceAmount: 0,
          allocableAmount: 0,
          tenantShare: 0.01,
          labor35a: 0,
          allocationRounding: 0,
          isRoundingDifference: true,
        },
      ],
      totalTenantShare: 1102.71,
      balance: 52.71,
      roundingDifference: 0.01,
    };
    const groups = createTenantStatementGroups(legacyPreview.rows);
    const actions = renderToStaticMarkup(
      <SettlementActions
        preview={legacyPreview}
        busy={false}
        onPrint={() => undefined}
        onCorrect={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(groups.at(-1)).toMatchObject({
      name: 'Alter Excel-Rundungsausgleich',
      tenantShare: 0.01,
      isLegacyRounding: true,
    });
    expect(actions).not.toContain('Drucken / PDF');
    expect(actions).toContain('Zur Korrektur öffnen');
  });
});
