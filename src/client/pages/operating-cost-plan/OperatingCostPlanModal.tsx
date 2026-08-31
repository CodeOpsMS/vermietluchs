import { euro } from '../../format';
import { FormActions, Modal, SaveForm } from '../../components/Common';
import type { OperatingCostPlanForm, ParsedOperatingCostPlanForm } from './model';

export default function OperatingCostPlanModal({
  form,
  year,
  preview,
  error,
  busy,
  onChange,
  onSave,
  onClose,
}: {
  form: OperatingCostPlanForm;
  year: number;
  preview: ParsedOperatingCostPlanForm | null;
  error: string;
  busy: boolean;
  onChange: (form: OperatingCostPlanForm) => void;
  onSave: () => void | Promise<void>;
  onClose: () => void;
}) {
  const field = (name: keyof OperatingCostPlanForm, value: string) =>
    onChange({ ...form, [name]: value });

  return (
    <Modal title={`Betriebskosten-Wirtschaftsplan ${year}`} onClose={onClose} wide>
      <SaveForm className="form-grid" onSubmit={onSave}>
        <label className="field">
          Wohnung
          <input
            aria-label="Wohnungskosten"
            inputMode="decimal"
            value={form.housingCosts}
            onChange={(event) => field('housingCosts', event.target.value)}
            placeholder="1.883,45"
          />
          <small>Umlagefähiger Jahresbetrag aus dem Wirtschaftsplan.</small>
        </label>
        <label className="field">
          Garage
          <input
            aria-label="Garagenkosten"
            inputMode="decimal"
            value={form.garageCosts}
            onChange={(event) => field('garageCosts', event.target.value)}
            placeholder="8,24"
          />
          <small>Geplanter Jahresbetrag für die Garage.</small>
        </label>
        <label className="field">
          Grundsteuer
          <input
            aria-label="Grundsteuer"
            inputMode="decimal"
            value={form.propertyTax}
            onChange={(event) => field('propertyTax', event.target.value)}
            placeholder="106,29"
          />
        </label>
        <label className="field">
          Monate
          <select
            aria-label="Anzahl Monate"
            value={form.months}
            onChange={(event) => field('months', event.target.value)}
          >
            {Array.from({ length: 12 }, (_, index) => index + 1).map((months) => (
              <option key={months} value={months}>
                {months}
              </option>
            ))}
          </select>
        </label>
        <label className="field span-2">
          Festgelegte monatliche Vorauszahlung
          <input
            aria-label="Festgelegte monatliche Vorauszahlung"
            inputMode="decimal"
            value={form.monthlyPrepayment}
            onChange={(event) => field('monthlyPrepayment', event.target.value)}
            placeholder="150,00"
          />
          <small>
            Optional. Als Ausgangswert wird die aktuelle Vertragsvorauszahlung verwendet.
          </small>
        </label>
        <div className="plan-form-preview span-2" aria-live="polite">
          <span>
            Jahresbetrag <strong>{preview ? euro(preview.annualTotal) : '—'}</strong>
          </span>
          <span>
            Rechnerisch pro Monat{' '}
            <strong>{preview ? euro(preview.calculatedMonthlyAmount) : '—'}</strong>
          </span>
        </div>
        <label className="field span-2">
          Notiz
          <textarea
            rows={3}
            value={form.notes}
            onChange={(event) => field('notes', event.target.value)}
            placeholder="Quelle oder Beschluss zum Wirtschaftsplan"
          />
        </label>
        {error && <p className="field-error">{error}</p>}
        <FormActions onCancel={onClose} submitLabel="Wirtschaftsplan speichern" busy={busy} />
      </SaveForm>
    </Modal>
  );
}
