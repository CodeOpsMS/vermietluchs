import { useMemo, useState } from 'react';
import type { PageProps } from '../App';
import { deleteJson, postJson, putJson } from '../api';
import { EmptyState, ErrorBox, PageHeader } from '../components/Common';
import { parseGermanNumber } from '../format';
import type { Meter, Reading } from '../types';
import { MeterFormModal } from './meters/MeterFormModal';
import { MeterSummary } from './meters/MeterSummary';
import { ReadingFormModal } from './meters/ReadingFormModal';
import { UnitMetersSection } from './meters/UnitMetersSection';
import {
  createEmptyMeterForm,
  createMeterFormForEditing,
  groupReadingsByMeter,
  type MeterForm,
  type ReadingForm,
} from './meters/meter-model';

export default function MetersPage({ data, propertyId, year, reload }: PageProps) {
  const [meterForm, setMeterForm] = useState<MeterForm | null>(null);
  const [readingForm, setReadingForm] = useState<ReadingForm | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const readingsByMeter = useMemo(() => groupReadingsByMeter(data.readings), [data.readings]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  async function saveMeter() {
    if (!meterForm || !meterForm.unitId || !meterForm.name.trim() || !meterForm.unitLabel.trim()) {
      return setError('Bitte Wohnung, Name und Einheit angeben.');
    }

    await run(async () => {
      const body = {
        unitId: Number(meterForm.unitId),
        name: meterForm.name.trim(),
        meterNumber: meterForm.meterNumber.trim(),
        type: meterForm.type,
        unitLabel: meterForm.unitLabel.trim(),
        revision: meterForm.revision,
      };
      if (meterForm.id) await putJson(`/api/meters/${meterForm.id}`, body);
      else await postJson('/api/meters', body);
      setMeterForm(null);
    });
  }

  async function saveReading() {
    if (!readingForm) return;
    const value = parseGermanNumber(readingForm.value);
    if (!readingForm.date || value === null || value < 0) {
      return setError('Bitte Datum und einen nicht negativen Zählerstand angeben.');
    }

    await run(async () => {
      const body = {
        meterId: readingForm.meterId,
        date: readingForm.date,
        value,
        note: readingForm.note.trim(),
        revision: readingForm.revision,
      };
      if (readingForm.id) {
        await putJson(`/api/readings/${readingForm.id}`, body);
      } else {
        await postJson('/api/readings', body);
      }
      setReadingForm(null);
    });
  }

  function editReading(meter: Meter, reading: Reading) {
    setReadingForm({
      id: reading.id,
      revision: reading.revision,
      meterId: meter.id,
      date: reading.date,
      value: String(reading.value).replace('.', ','),
      note: reading.note,
    });
  }

  return (
    <>
      <PageHeader
        title="Zähler & Ablesungen"
        subtitle="Zähler dauerhaft der Wohnung zuordnen und Stände chronologisch dokumentieren. Zwischenablesungen ermöglichen einen exakten Mieterwechsel."
        actions={
          <button
            className="btn btn-primary"
            disabled={!propertyId || data.units.length === 0}
            onClick={() => setMeterForm(createEmptyMeterForm(data.units[0]?.id))}
          >
            + Zähler
          </button>
        }
      />
      {error && <ErrorBox message={error} />}

      <MeterSummary meters={data.meters} readingsByMeter={readingsByMeter} year={year} />

      {data.units.length === 0 && (
        <EmptyState title="Zuerst eine Wohnung anlegen">
          Jeder Zähler gehört zu genau einer Wohnung.
        </EmptyState>
      )}

      {data.units.map((unit) => (
        <UnitMetersSection
          key={unit.id}
          unit={unit}
          meters={data.meters.filter((meter) => meter.unitId === unit.id)}
          readingsByMeter={readingsByMeter}
          year={year}
          onCreateMeter={(selectedUnit) => setMeterForm(createEmptyMeterForm(selectedUnit.id))}
          onEditMeter={(meter) => setMeterForm(createMeterFormForEditing(meter))}
          onCreateReading={(meter) =>
            setReadingForm({
              meterId: meter.id,
              date: `${year}-12-31`,
              value: '',
              note: '',
            })
          }
          onEditReading={editReading}
          onDeleteReading={(reading) =>
            run(async () => {
              await deleteJson(`/api/readings/${reading.id}`, reading.revision);
            })
          }
          onDeleteMeter={(meter) =>
            run(async () => {
              await deleteJson(`/api/meters/${meter.id}`, meter.revision);
            })
          }
        />
      ))}

      {meterForm && (
        <MeterFormModal
          form={meterForm}
          units={data.units}
          error={error}
          busy={busy}
          onChange={setMeterForm}
          onSave={saveMeter}
          onClose={() => setMeterForm(null)}
        />
      )}

      {readingForm && (
        <ReadingFormModal
          form={readingForm}
          error={error}
          busy={busy}
          onChange={setReadingForm}
          onSave={saveReading}
          onClose={() => setReadingForm(null)}
        />
      )}
    </>
  );
}
