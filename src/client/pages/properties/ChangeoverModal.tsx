import { useState } from 'react';
import type { FormEvent } from 'react';
import { FieldError, FormActions, Modal } from '../../components/Common';
import { GermanDateInput } from '../../components/GermanDateInput';
import { parseGermanNumber } from '../../format';
import type { Meter, Tenancy, Unit } from '../../types';
import { createEmptyTenancyForm, type TenancyForm } from './formModels';

export type ChangeoverPayload = {
  previousTenancyId: number;
  previousRevision: number;
  endDate: string;
  nextTenancy: {
    tenantName: string;
    tenantAddress: string;
    startDate: string;
    endDate: null;
    persons: number;
    baseRent: number;
    utilityPrepayment: number;
    garagePrepayment: number;
    paymentDay: number;
    notes: string;
  };
  readings: Array<{ meterId: number; date: string; value: number }>;
};

type ChangeoverModalProps = {
  tenancy: Tenancy;
  unit?: Unit;
  meters: Meter[];
  year: number;
  busy: boolean;
  error: string;
  onClose: () => void;
  onDone: (payload: ChangeoverPayload) => Promise<void>;
};

export default function ChangeoverModal({
  tenancy,
  unit,
  meters,
  year,
  busy,
  error,
  onClose,
  onDone,
}: ChangeoverModalProps) {
  const [endDate, setEndDate] = useState('');
  const [nextTenancy, setNextTenancy] = useState<TenancyForm>(
    createEmptyTenancyForm(tenancy.unitId, year),
  );
  const [readingValues, setReadingValues] = useState<Record<number, string>>({});
  const [validationError, setValidationError] = useState('');

  function updateNextTenancy(changes: Partial<TenancyForm>) {
    setNextTenancy({ ...nextTenancy, ...changes });
    setValidationError('');
  }

  function updateEndDate(value: string) {
    setEndDate(value);
    setValidationError('');

    if (!value) {
      updateNextTenancy({ startDate: `${year}-01-01` });
      return;
    }

    const nextDay = new Date(`${value}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    updateNextTenancy({ startDate: nextDay.toISOString().slice(0, 10) });
  }

  function updateReading(meterId: number, value: string) {
    setReadingValues({ ...readingValues, [meterId]: value });
    setValidationError('');
  }

  async function submit() {
    setValidationError('');

    if (!endDate) {
      setValidationError('Bitte den letzten Miettag angeben.');
      return;
    }
    if (endDate < tenancy.startDate) {
      setValidationError('Der letzte Miettag darf nicht vor dem Mietbeginn liegen.');
      return;
    }
    if (!nextTenancy.startDate || nextTenancy.startDate <= endDate) {
      setValidationError('Der Nachmieter muss nach dem Auszug einziehen.');
      return;
    }
    if (!nextTenancy.tenantName.trim()) {
      setValidationError('Bitte den Namen des Nachmieters angeben.');
      return;
    }

    const persons = parseGermanNumber(nextTenancy.persons);
    const baseRent = parseGermanNumber(nextTenancy.baseRent);
    const utilityPrepayment = parseGermanNumber(nextTenancy.utilityPrepayment);
    const garagePrepayment = parseGermanNumber(nextTenancy.garagePrepayment);
    const paymentDay = Number(nextTenancy.paymentDay);

    if (persons === null || persons <= 0) {
      setValidationError('Bitte eine positive Personenzahl angeben.');
      return;
    }
    if (baseRent === null || baseRent < 0) {
      setValidationError('Bitte eine gültige, nicht negative Kaltmiete angeben.');
      return;
    }
    if (utilityPrepayment === null || utilityPrepayment < 0) {
      setValidationError('Bitte eine gültige, nicht negative NK-Vorauszahlung angeben.');
      return;
    }
    if (garagePrepayment === null || garagePrepayment < 0) {
      setValidationError('Bitte einen gültigen, nicht negativen Garagenbetrag angeben.');
      return;
    }
    if (!Number.isInteger(paymentDay) || paymentDay < 1 || paymentDay > 31) {
      setValidationError('Der Zahlungstag muss zwischen 1 und 31 liegen.');
      return;
    }

    const readings: ChangeoverPayload['readings'] = [];
    for (const meter of meters) {
      const enteredValue = readingValues[meter.id] ?? '';
      if (!enteredValue.trim()) continue;

      const value = parseGermanNumber(enteredValue);
      if (value === null || value < 0) {
        setValidationError(`Bitte den Zwischenstand für „${meter.name}“ prüfen.`);
        return;
      }
      readings.push({ meterId: meter.id, date: endDate, value });
    }

    await onDone({
      previousTenancyId: tenancy.id,
      previousRevision: tenancy.revision,
      endDate,
      nextTenancy: {
        tenantName: nextTenancy.tenantName.trim(),
        tenantAddress: nextTenancy.tenantAddress.trim(),
        startDate: nextTenancy.startDate,
        endDate: null,
        persons,
        baseRent,
        utilityPrepayment,
        garagePrepayment,
        paymentDay,
        notes: nextTenancy.notes.trim(),
      },
      readings,
    });
  }

  const liveDateError =
    endDate && nextTenancy.startDate && nextTenancy.startDate <= endDate
      ? 'Der Nachmieter muss nach dem Auszug einziehen.'
      : '';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  return (
    <Modal wide title={`Mieterwechsel · ${unit?.name ?? ''}`} onClose={onClose}>
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="alert alert-info span-2">
          <strong>{tenancy.tenantName}</strong> wird beendet. Nachmieter und Zwischenstände werden
          gemeinsam gespeichert – entweder vollständig oder gar nicht.
        </div>
        <label className="field">
          Letzter Miettag
          <GermanDateInput value={endDate} onChange={updateEndDate} required />
        </label>
        <label className="field">
          Einzug Nachmieter
          <GermanDateInput
            value={nextTenancy.startDate}
            onChange={(startDate) => updateNextTenancy({ startDate })}
            required
          />
        </label>
        <label className="field">
          Name Nachmieter
          <input
            value={nextTenancy.tenantName}
            onChange={(event) => updateNextTenancy({ tenantName: event.target.value })}
            required
          />
        </label>
        <label className="field">
          Personen
          <input
            type="number"
            min="1"
            value={nextTenancy.persons}
            onChange={(event) => updateNextTenancy({ persons: event.target.value })}
          />
        </label>
        <label className="field span-2">
          Korrespondenzanschrift Nachmieter
          <textarea
            rows={2}
            value={nextTenancy.tenantAddress}
            onChange={(event) => updateNextTenancy({ tenantAddress: event.target.value })}
            placeholder="Straße, PLZ Ort"
          />
        </label>
        <label className="field">
          Kaltmiete
          <input
            inputMode="decimal"
            value={nextTenancy.baseRent}
            onChange={(event) => updateNextTenancy({ baseRent: event.target.value })}
            required
          />
        </label>
        <label className="field">
          NK-Vorauszahlung
          <input
            inputMode="decimal"
            value={nextTenancy.utilityPrepayment}
            onChange={(event) => updateNextTenancy({ utilityPrepayment: event.target.value })}
            required
          />
        </label>
        <label className="field">
          Garage / Monat
          <input
            inputMode="decimal"
            value={nextTenancy.garagePrepayment}
            onChange={(event) => updateNextTenancy({ garagePrepayment: event.target.value })}
          />
        </label>
        <label className="field">
          Zahlungstag
          <input
            type="number"
            min="1"
            max="31"
            value={nextTenancy.paymentDay}
            onChange={(event) => updateNextTenancy({ paymentDay: event.target.value })}
            required
          />
        </label>
        <label className="field span-2">
          Interne Notiz zum Nachmieter
          <textarea
            rows={2}
            value={nextTenancy.notes}
            onChange={(event) => updateNextTenancy({ notes: event.target.value })}
          />
        </label>
        {meters.length > 0 && (
          <fieldset className="span-2">
            <legend>Zwischenablesung am Auszugstag (optional)</legend>
            <div className="form-grid compact">
              {meters.map((meter) => (
                <label className="field" key={meter.id}>
                  {meter.name} · {meter.unitLabel}
                  <input
                    inputMode="decimal"
                    value={readingValues[meter.id] ?? ''}
                    onChange={(event) => updateReading(meter.id, event.target.value)}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <FieldError>{validationError || error || liveDateError}</FieldError>
        <FormActions busy={busy} submitLabel="Mieterwechsel speichern" onCancel={onClose} />
      </form>
    </Modal>
  );
}
