import { describe, expect, test } from 'vitest';
import { externalizeCostMessages } from '../src/server/external-messages';

describe('Externe Abrechnungshinweise', () => {
  test('ersetzt Kostenbezeichnungen atomar und dedupliziert Sammelhinweise', () => {
    const result = externalizeCostMessages(
      ['„Interne Wasserrechnung“: Basis fehlt.', '„Wohnung“: Basis fehlt.'],
      [
        { internalName: 'Interne Wasserrechnung', statementGroup: 'Wohnung' },
        { internalName: 'Wohnung', statementGroup: 'Garage' },
      ],
    );

    expect(result).toEqual(['„Wohnung“: Basis fehlt.', '„Garage“: Basis fehlt.']);
  });

  test('neutralisiert unbekannte alte Kostenbezeichnungen am Meldungsanfang', () => {
    expect(
      externalizeCostMessages(['„Alter interner Name“: Die Wohnflächenbasis fehlt.'], [], true),
    ).toEqual(['„Betriebskosten“: Die Wohnflächenbasis fehlt.']);
  });
});
