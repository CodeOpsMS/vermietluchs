import { METER_TYPES } from '../../../shared/constants';
import type { Meter } from '../../types';
import { TYPE_LABEL, type ReadingsByMeter } from './meter-model';

type MeterSummaryProps = {
  meters: Meter[];
  readingsByMeter: ReadingsByMeter;
  year: number;
};

export function MeterSummary({ meters, readingsByMeter, year }: MeterSummaryProps) {
  return (
    <section className="meter-summary">
      {METER_TYPES.map((type) => {
        const metersOfType = meters.filter((meter) => meter.type === type);
        const currentReadings = metersOfType
          .flatMap((meter) => readingsByMeter.get(meter.id) ?? [])
          .filter((reading) => reading.date.startsWith(String(year))).length;

        return (
          <article key={type}>
            <span className={`meter-dot meter-${type}`} />
            <div>
              <strong>{TYPE_LABEL[type]}</strong>
              <small>
                {metersOfType.length} Zähler · {currentReadings} Ablesungen {year}
              </small>
            </div>
          </article>
        );
      })}
    </section>
  );
}
