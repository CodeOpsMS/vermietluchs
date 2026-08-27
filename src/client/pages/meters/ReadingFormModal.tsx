import { FieldError, FormActions, Modal, SaveForm } from '../../components/Common';
import { GermanDateInput } from '../../components/GermanDateInput';
import type { ReadingForm } from './meter-model';

type ReadingFormModalProps = {
  form: ReadingForm;
  error: string;
  busy: boolean;
  onChange: (form: ReadingForm) => void;
  onSave: () => void | Promise<void>;
  onClose: () => void;
};

export function ReadingFormModal({
  form,
  error,
  busy,
  onChange,
  onSave,
  onClose,
}: ReadingFormModalProps) {
  return (
    <Modal title={form.id ? 'Ablesung bearbeiten' : 'Ablesung erfassen'} onClose={onClose}>
      <SaveForm className="form-grid" onSubmit={onSave}>
        <label className="field">
          Datum
          <GermanDateInput
            value={form.date}
            onChange={(date) => onChange({ ...form, date })}
            required
          />
        </label>
        <label className="field">
          Zählerstand
          <input
            autoFocus
            inputMode="decimal"
            value={form.value}
            onChange={(event) => onChange({ ...form, value: event.target.value })}
            required
          />
        </label>
        <label className="field span-2">
          Notiz
          <textarea
            value={form.note}
            onChange={(event) => onChange({ ...form, note: event.target.value })}
            placeholder="z. B. Zwischenablesung beim Auszug"
          />
        </label>
        <FieldError>{error}</FieldError>
        <FormActions busy={busy} onCancel={onClose} />
      </SaveForm>
    </Modal>
  );
}
