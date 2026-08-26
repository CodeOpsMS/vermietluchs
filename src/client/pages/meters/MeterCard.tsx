import { ConfirmButton, StatusPill } from '../../components/Common';
import { dateDe, number } from '../../format';
import type { Meter, Reading } from '../../types';
import { TYPE_LABEL } from './meter-model';

type MeterCardProps = {
  meter: Meter;
  readings: Reading[];
  year: number;
  onEditMeter: (meter: Meter) => void;
  onCreateReading: (meter: Meter) => void;
  onEditReading: (meter: Meter, reading: Reading) => void;
  onDeleteReading: (reading: Reading) => void | Promise<void>;
  onDeleteMeter: (meter: Meter) => void | Promise<void>;
};

export function MeterCard({
  meter,
  readings,
  year,
  onEditMeter,
  onCreateReading,
  onEditReading,
  onDeleteReading,
  onDeleteMeter,
}: MeterCardProps) {
  const yearReadings = readings
    .filter((reading) => reading.date >= `${year - 1}-12-31` && reading.date <= `${year}-12-31`)
    .slice()
    .sort((left, right) => left.date.localeCompare(right.date));
  const delta =
    yearReadings.length >= 2
      ? yearReadings[yearReadings.length - 1].value - yearReadings[0].value
      : null;

  return (
    <article className="meter-card">
      <header>
        <div>
          <StatusPill tone="navy">{TYPE_LABEL[meter.type]}</StatusPill>
          <h3>{meter.name}</h3>
          <small>{meter.meterNumber || 'Keine Zählernummer'}</small>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label={`Zähler ${meter.name} bearbeiten`}
          title="Zähler bearbeiten"
          onClick={() => onEditMeter(meter)}
        >
          ✎
        </button>
      </header>

      <div className={`consumption ${delta !== null && delta < 0 ? 'negative-delta' : ''}`}>
        <span>Standdifferenz {year}</span>
        <strong>{delta === null ? '—' : `${number(delta)} ${meter.unitLabel}`}</strong>
        <small>
          {delta === null
            ? 'Mindestens zwei passende Randstände nötig'
            : delta < 0
              ? 'Negativer Verlauf: Zählerwechsel, Rücksetzung oder Eingabe prüfen'
              : 'Reine Differenz der erfassten Randstände – kein abgerechneter Verbrauch'}
        </small>
      </div>

      <div className="reading-list">
        {readings.length === 0 && <p className="muted-text">Noch keine Ablesung erfasst.</p>}
        {readings.map((reading) => (
          <div key={reading.id}>
            <span>
              <b>{number(reading.value)}</b> {meter.unitLabel}
              <small>
                {dateDe(reading.date)}
                {reading.note ? ` · ${reading.note}` : ''}
              </small>
            </span>
            <span className="row-actions">
              <button
                className="icon-button"
                type="button"
                aria-label={`Ablesung vom ${dateDe(reading.date)} bearbeiten`}
                title="Ablesung bearbeiten"
                onClick={() => onEditReading(meter, reading)}
              >
                ✎
              </button>
              <ConfirmButton
                className="icon-button danger"
                question={`Ablesung vom ${dateDe(reading.date)} löschen?`}
                onConfirm={() => onDeleteReading(reading)}
              >
                ×
              </ConfirmButton>
            </span>
          </div>
        ))}
      </div>

      <footer>
        <button className="btn btn-secondary btn-small" onClick={() => onCreateReading(meter)}>
          + Ablesung
        </button>
        <ConfirmButton
          question={`Zähler „${meter.name}“ samt Ablesungen löschen?`}
          onConfirm={() => onDeleteMeter(meter)}
        >
          Zähler löschen
        </ConfirmButton>
      </footer>
    </article>
  );
}
