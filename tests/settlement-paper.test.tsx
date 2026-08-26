import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import SettlementActions from '../src/client/pages/settlement/SettlementActions';
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
      description: 'Wohnung',
      statementGroup: 'Wohnung',
      allocationLabel: 'Fester Mieteranteil',
      sourceAmount: 1102.7,
      allocableAmount: 1102.7,
      tenantShare: 1102.7,
      labor35a: 0,
      allocationRounding: 0.01,
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
});
