import type { Meter, Reading, Unit } from '../../types';
import { MeterCard } from './MeterCard';
import type { ReadingsByMeter } from './meter-model';

type UnitMetersSectionProps = {
  unit: Unit;
  meters: Meter[];
  readingsByMeter: ReadingsByMeter;
  year: number;
  onCreateMeter: (unit: Unit) => void;
  onEditMeter: (meter: Meter) => void;
  onCreateReading: (meter: Meter) => void;
  onEditReading: (meter: Meter, reading: Reading) => void;
  onDeleteReading: (reading: Reading) => void | Promise<void>;
  onDeleteMeter: (meter: Meter) => void | Promise<void>;
};

export function UnitMetersSection({
  unit,
  meters,
  readingsByMeter,
  year,
  onCreateMeter,
  onEditMeter,
  onCreateReading,
  onEditReading,
  onDeleteReading,
  onDeleteMeter,
}: UnitMetersSectionProps) {
  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{unit.floor || 'Wohnung'}</p>
          <h2>{unit.name}</h2>
        </div>
        <button className="btn btn-secondary btn-small" onClick={() => onCreateMeter(unit)}>
          + Zähler
        </button>
      </div>

      {meters.length === 0 && <p className="muted-text">Noch kein Zähler für diese Wohnung.</p>}
      <div className="meter-grid">
        {meters.map((meter) => (
          <MeterCard
            key={meter.id}
            meter={meter}
            readings={readingsByMeter.get(meter.id) ?? []}
            year={year}
            onEditMeter={onEditMeter}
            onCreateReading={onCreateReading}
            onEditReading={onEditReading}
            onDeleteReading={onDeleteReading}
            onDeleteMeter={onDeleteMeter}
          />
        ))}
      </div>
    </section>
  );
}
