import type { Meter, MeterType, Reading } from '../../types';

export type MeterForm = {
  id?: number;
  revision?: number;
  unitId: string;
  name: string;
  meterNumber: string;
  type: MeterType;
  unitLabel: string;
};

export type ReadingForm = {
  id?: number;
  revision?: number;
  meterId: number;
  date: string;
  value: string;
  note: string;
};

export type ReadingsByMeter = Map<number, Reading[]>;

export const TYPE_LABEL: Record<MeterType, string> = {
  heating: 'Heizung',
  hotWater: 'Warmwasser',
  coldWater: 'Kaltwasser',
  other: 'Sonstige',
};

export const TYPE_UNIT: Record<MeterType, string> = {
  heating: 'kWh',
  hotWater: 'm³',
  coldWater: 'm³',
  other: 'Einheiten',
};

export function createEmptyMeterForm(
  unitId: number | undefined,
  type: MeterType = 'coldWater',
): MeterForm {
  return {
    unitId: unitId ? String(unitId) : '',
    name: '',
    meterNumber: '',
    type,
    unitLabel: TYPE_UNIT[type],
  };
}

export function createMeterFormForEditing(meter: Meter): MeterForm {
  return {
    id: meter.id,
    revision: meter.revision,
    unitId: String(meter.unitId),
    name: meter.name,
    meterNumber: meter.meterNumber,
    type: meter.type,
    unitLabel: meter.unitLabel,
  };
}

export function groupReadingsByMeter(readings: Reading[]): ReadingsByMeter {
  const readingsByMeter = new Map<number, Reading[]>();
  for (const reading of readings) {
    const list = readingsByMeter.get(reading.meterId) ?? [];
    list.push(reading);
    readingsByMeter.set(
      reading.meterId,
      list.sort((left, right) => right.date.localeCompare(left.date)),
    );
  }
  return readingsByMeter;
}
