import { FieldError, FormActions, Modal, SaveForm } from '../../components/Common';
import type { PropertyForm } from './formModels';

type PropertyFormModalProps = {
  form: PropertyForm;
  error: string;
  busy: boolean;
  onChange: (form: PropertyForm) => void;
  onSave: () => void | Promise<void>;
  onClose: () => void;
};

export default function PropertyFormModal({
  form,
  error,
  busy,
  onChange,
  onSave,
  onClose,
}: PropertyFormModalProps) {
  return (
    <Modal wide title={form.id ? 'Haus bearbeiten' : 'Haus anlegen'} onClose={onClose}>
      <SaveForm className="form-grid" onSubmit={onSave}>
        <label className="field span-2">
          Bezeichnung
          <input
            autoFocus
            value={form.name}
            onChange={(event) => onChange({ ...form, name: event.target.value })}
            placeholder="z. B. Lindenstraße 12"
            required
          />
        </label>
        <label className="field span-2">
          Anschrift
          <textarea
            value={form.address}
            onChange={(event) => onChange({ ...form, address: event.target.value })}
            placeholder="Straße, PLZ Ort"
            rows={2}
          />
        </label>
        <div className="form-section span-2">
          <strong>Abweichende Abrechnungsdaten (optional)</strong>
          <small>Leer lassen, um die globalen Einstellungen zu verwenden.</small>
        </div>
        <label className="field">
          Vermietername
          <input
            value={form.landlordName}
            onChange={(event) => onChange({ ...form, landlordName: event.target.value })}
          />
        </label>
        <label className="field">
          Zahlungsfrist in Tagen
          <input
            type="number"
            min="1"
            max="365"
            value={form.paymentDeadlineDays}
            onChange={(event) => onChange({ ...form, paymentDeadlineDays: event.target.value })}
          />
        </label>
        <label className="field span-2">
          Vermieteranschrift
          <textarea
            rows={2}
            value={form.landlordAddress}
            onChange={(event) => onChange({ ...form, landlordAddress: event.target.value })}
          />
        </label>
        <label className="field">
          Kontoinhaber
          <input
            value={form.bankAccountHolder}
            onChange={(event) => onChange({ ...form, bankAccountHolder: event.target.value })}
          />
        </label>
        <label className="field">
          IBAN
          <input
            value={form.bankIban}
            onChange={(event) => onChange({ ...form, bankIban: event.target.value.toUpperCase() })}
          />
        </label>
        <FieldError>{error}</FieldError>
        <FormActions busy={busy} onCancel={onClose} />
      </SaveForm>
    </Modal>
  );
}
