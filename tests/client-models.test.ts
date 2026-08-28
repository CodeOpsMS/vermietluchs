import { describe, expect, test } from 'vitest';
import { createCostFormForEditing } from '../src/client/pages/costs/cost-model';
import {
  createEmptyMeterForm,
  createMeterFormForEditing,
  groupReadingsByMeter,
} from '../src/client/pages/meters/meter-model';
import {
  createEmptyPropertyForm,
  createEmptyTenancyForm,
  createEmptyUnitForm,
  propertyToForm,
  tenancyToForm,
  unitToForm,
} from '../src/client/pages/properties/formModels';
import {
  createEmptyPayment,
  createPaymentForm,
  getPaidParts,
  paidTotal,
  parsePaidParts,
  type PaymentForm,
} from '../src/client/pages/rent/paymentModel';
import type { Cost, Meter, Payment, Property, Reading, Tenancy, Unit } from '../src/client/types';

const tenancy: Tenancy = {
  id: 11,
  revision: 2,
  unitId: 4,
  tenantName: 'Erika Beispiel',
  tenantAddress: 'Musterweg 3',
  startDate: '2024-02-20',
  endDate: null,
  persons: 1.5,
  baseRent: 650.25,
  utilityPrepayment: 140.5,
  garagePrepayment: 40,
  paymentDay: 31,
  notes: 'Hinweis',
};

const payment: Payment = {
  id: 8,
  revision: 3,
  tenancyId: tenancy.id,
  dueDate: '2024-03-31',
  paidDate: '2024-03-29',
  baseRentDue: 650.25,
  utilityDue: 140.5,
  garageDue: 40,
  amountPaid: 800.75,
  baseRentPaid: 640.25,
  utilityPaid: 130.5,
  garagePaid: 30,
  note: 'Teilzahlung',
};

function emptyPaymentForm(overrides: Partial<PaymentForm> = {}): PaymentForm {
  return {
    tenancyId: '11',
    dueDate: '2024-03-31',
    paidDate: '',
    baseRentDue: '650,25',
    utilityDue: '140,50',
    garageDue: '40',
    baseRentPaid: '0',
    utilityPaid: '0',
    garagePaid: '0',
    note: '',
    ...overrides,
  };
}

describe('Formularmodelle', () => {
  test('erzeugt leere, stabile Standardwerte', () => {
    expect(createEmptyPropertyForm()).toEqual({
      name: '',
      address: '',
      landlordName: '',
      landlordAddress: '',
      bankAccountHolder: '',
      bankIban: '',
      paymentDeadlineDays: '',
    });
    expect(createEmptyUnitForm()).toMatchObject({ areaSqm: '', unitWeight: '1' });
    expect(createEmptyTenancyForm(4, 2025)).toMatchObject({
      unitId: 4,
      startDate: '2025-01-01',
      persons: '1',
      garagePrepayment: '0',
      paymentDay: '3',
    });
  });

  test('übernimmt optionale Objektdaten null-sicher', () => {
    const property: Property = {
      id: 1,
      revision: 2,
      name: 'Haus Nord',
      address: 'Nordweg 1',
      landlordName: null,
      landlordAddress: null,
      bankAccountHolder: null,
      bankIban: null,
      paymentDeadlineDays: null,
    };

    expect(propertyToForm(property)).toEqual({
      id: 1,
      revision: 2,
      name: 'Haus Nord',
      address: 'Nordweg 1',
      landlordName: '',
      landlordAddress: '',
      bankAccountHolder: '',
      bankIban: '',
      paymentDeadlineDays: '',
    });
  });

  test('formatiert Dezimalwerte aus Wohnung und Mietverhältnis deutsch', () => {
    const unit: Unit = {
      id: 4,
      revision: 1,
      propertyId: 1,
      name: 'Links',
      floor: '1. OG',
      areaSqm: 71.25,
      unitWeight: 0.5,
      notes: '',
    };

    expect(unitToForm(unit)).toMatchObject({ areaSqm: '71,25', unitWeight: '0,5' });
    expect(tenancyToForm(tenancy)).toMatchObject({
      endDate: '',
      persons: '1,5',
      baseRent: '650,25',
      utilityPrepayment: '140,5',
      garagePrepayment: '40',
    });
  });

  test('überführt Kosten inklusive optionaler Zuordnungen in die Bearbeitung', () => {
    const cost: Cost = {
      id: 3,
      revision: 4,
      propertyId: 1,
      year: 2024,
      descriptionInternal: 'Wasser intern',
      descriptionTenant: 'Wasser',
      sourceAmount: 123.45,
      tenantStatus: 'included',
      allocableAmount: 100.25,
      statementGroup: 'Wasser',
      allocationMode: 'standard',
      allocationKey: 'direct',
      directUnitId: 4,
      directTenancyId: null,
      meterType: null,
      labor35a: 10.5,
      notes: '',
    };

    expect(createCostFormForEditing(cost)).toMatchObject({
      id: 3,
      revision: 4,
      sourceAmount: '123,45',
      allocableAmount: '100,25',
      directUnitId: '4',
      directTenancyId: '',
      meterType: '',
      labor35a: '10,5',
    });
  });
});

describe('Zähler-Formularmodell', () => {
  test('setzt Zählertyp und Einheit gemeinsam als Standard', () => {
    expect(createEmptyMeterForm(undefined)).toMatchObject({
      unitId: '',
      type: 'coldWater',
      unitLabel: 'm³',
    });
    expect(createEmptyMeterForm(4, 'heating')).toMatchObject({
      unitId: '4',
      type: 'heating',
      unitLabel: 'kWh',
    });
  });

  test('übernimmt einen gespeicherten Zähler vollständig', () => {
    const meter: Meter = {
      id: 6,
      revision: 2,
      unitId: 4,
      name: 'Bad',
      meterNumber: 'Z-123',
      type: 'hotWater',
      unitLabel: 'Liter',
    };

    expect(createMeterFormForEditing(meter)).toEqual({
      id: 6,
      revision: 2,
      unitId: '4',
      name: 'Bad',
      meterNumber: 'Z-123',
      type: 'hotWater',
      unitLabel: 'Liter',
    });
  });

  test('gruppiert Ablesungen pro Zähler absteigend nach Datum', () => {
    const readings: Reading[] = [
      { id: 1, revision: 0, meterId: 6, date: '2024-01-01', value: 10, note: '' },
      { id: 2, revision: 0, meterId: 7, date: '2024-06-01', value: 20, note: '' },
      { id: 3, revision: 0, meterId: 6, date: '2024-12-31', value: 30, note: '' },
    ];

    const grouped = groupReadingsByMeter(readings);
    expect([...grouped.keys()]).toEqual([6, 7]);
    expect(grouped.get(6)?.map((reading) => reading.id)).toEqual([3, 1]);
    expect(grouped.get(7)?.map((reading) => reading.id)).toEqual([2]);
  });
});

describe('Mietzahlungsmodell', () => {
  test('verwendet eine explizit gespeicherte Zahlungsaufteilung', () => {
    expect(getPaidParts(payment)).toEqual({
      baseRentPaid: 640.25,
      utilityPaid: 130.5,
      garagePaid: 30,
    });
  });

  test('rekonstruiert alte Zahlungen in der festgelegten Reihenfolge', () => {
    expect(
      getPaidParts({
        ...payment,
        amountPaid: 720,
        baseRentPaid: undefined,
        utilityPaid: undefined,
        garagePaid: undefined,
      }),
    ).toEqual({ baseRentPaid: 650.25, utilityPaid: 69.75, garagePaid: 0 });
  });

  test('liest deutsche Teilbeträge und rundet die Summe centgenau', () => {
    const parts = parsePaidParts(
      emptyPaymentForm({ baseRentPaid: '0,1', utilityPaid: '0,2', garagePaid: '0' }),
    );
    expect(parts).toEqual({ baseRentPaid: 0.1, utilityPaid: 0.2, garagePaid: 0 });
    expect(paidTotal(parts!)).toBe(0.3);
  });

  test.each([{ baseRentPaid: '-1' }, { utilityPaid: 'offen' }, { garagePaid: '' }])(
    'lehnt ungültige Teilbeträge ab: %o',
    (overrides) => {
      expect(parsePaidParts(emptyPaymentForm(overrides))).toBeNull();
    },
  );

  test('setzt die erste Fälligkeit nicht vor den Mietbeginn', () => {
    expect(createEmptyPayment({ ...tenancy, paymentDay: 3 }, 2024)).toMatchObject({
      tenancyId: '11',
      dueDate: '2024-02-20',
      baseRentDue: '650,25',
      utilityDue: '140,5',
      garageDue: '40',
    });
  });

  test('begrenzt den Zahlungstag auf das Monatsende', () => {
    expect(
      createEmptyPayment({ ...tenancy, startDate: '2024-02-01', paymentDay: 31 }, 2024).dueDate,
    ).toBe('2024-02-29');
  });

  test('liefert für ein außerhalb liegendes Mietverhältnis kein Fälligkeitsdatum', () => {
    expect(
      createEmptyPayment({ ...tenancy, startDate: '2023-01-01', endDate: '2023-12-31' }, 2024)
        .dueDate,
    ).toBe('');
  });

  test('überführt eine gespeicherte Zahlung verlustfrei ins Formular', () => {
    expect(createPaymentForm(payment)).toEqual({
      id: 8,
      revision: 3,
      tenancyId: '11',
      dueDate: '2024-03-31',
      paidDate: '2024-03-29',
      baseRentDue: '650,25',
      utilityDue: '140,5',
      garageDue: '40',
      baseRentPaid: '640,25',
      utilityPaid: '130,5',
      garagePaid: '30',
      note: 'Teilzahlung',
    });
  });
});
