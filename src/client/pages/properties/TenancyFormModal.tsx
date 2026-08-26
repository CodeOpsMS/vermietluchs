import { FieldError, FormActions, Modal, SaveForm } from '../../components/Common';
import { GermanDateInput } from '../../components/GermanDateInput';
import type { TenancyForm } from './formModels';

type TenancyFormModalProps = {
  form: TenancyForm;
  error: string;
  busy: boolean;
  onChange: (form: TenancyForm) => void;
  onSave: () => void | Promise<void>;
  onClose: () => void;
};

export default function TenancyFormModal({
  form,
  error,
  busy,
  onChange,
  onSave,
  onClose,
}: TenancyFormModalProps) {
  return (
    <Modal
      wide
      title={form.id ? 'Mietverhältnis bearbeiten' : 'Mietverhältnis anlegen'}
      onClose={onClose}
    >
      <SaveForm className="form-grid" onSubmit={onSave}>
        <label className="field">
          Name
          <input
            autoFocus
            value={form.tenantName}
            onChange={(event) => onChange({ ...form, tenantName: event.target.value })}
            required
          />
        </label>
        <label className="field">
          Personen
          <input
            type="number"
            min="1"
            step="0.5"
            value={form.persons}
            onChange={(event) => onChange({ ...form, persons: event.target.value })}
          />
        </label>
        <label className="field span-2">
          Korrespondenzanschrift
          <textarea
            rows={2}
            value={form.tenantAddress}
            onChange={(event) => onChange({ ...form, tenantAddress: event.target.value })}
          />
        </label>
        <label className="field">
          Mietbeginn
          <GermanDateInput
            value={form.startDate}
            onChange={(startDate) => onChange({ ...form, startDate })}
            required
          />
        </label>
        <label className="field">
          Mietende (optional)
          <GermanDateInput
            value={form.endDate}
            onChange={(endDate) => onChange({ ...form, endDate })}
          />
        </label>
        <label className="field">
          Kaltmiete / Monat
          <input
            inputMode="decimal"
            value={form.baseRent}
            onChange={(event) => onChange({ ...form, baseRent: event.target.value })}
            required
          />
        </label>
        <label className="field">
          NK-Vorauszahlung / Monat
          <input
            inputMode="decimal"
            value={form.utilityPrepayment}
            onChange={(event) => onChange({ ...form, utilityPrepayment: event.target.value })}
            required
          />
        </label>
        <label className="field">
          Garage / Monat
          <input
            inputMode="decimal"
            value={form.garagePrepayment}
            onChange={(event) => onChange({ ...form, garagePrepayment: event.target.value })}
          />
        </label>
        <label className="field">
          Zahlungstag
          <input
            type="number"
            min="1"
            max="31"
            value={form.paymentDay}
            onChange={(event) => onChange({ ...form, paymentDay: event.target.value })}
          />
        </label>
        <label className="field span-2">
          Interne Notiz
          <textarea
            value={form.notes}
            onChange={(event) => onChange({ ...form, notes: event.target.value })}
          />
        </label>
        <FieldError>{error}</FieldError>
        <FormActions busy={busy} onCancel={onClose} />
      </SaveForm>
    </Modal>
  );
}
