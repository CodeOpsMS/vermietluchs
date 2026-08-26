import { FieldError, FormActions, Modal, SaveForm } from '../../components/Common';
import type { UnitForm } from './formModels';

type UnitFormModalProps = {
  form: UnitForm;
  error: string;
  busy: boolean;
  onChange: (form: UnitForm) => void;
  onSave: () => void | Promise<void>;
  onClose: () => void;
};

export default function UnitFormModal({
  form,
  error,
  busy,
  onChange,
  onSave,
  onClose,
}: UnitFormModalProps) {
  return (
    <Modal title={form.id ? 'Wohnung bearbeiten' : 'Wohnung anlegen'} onClose={onClose}>
      <SaveForm className="form-grid" onSubmit={onSave}>
        <label className="field span-2">
          Bezeichnung
          <input
            autoFocus
            value={form.name}
            onChange={(event) => onChange({ ...form, name: event.target.value })}
            placeholder="z. B. DG links"
            required
          />
        </label>
        <label className="field">
          Etage
          <input
            value={form.floor}
            onChange={(event) => onChange({ ...form, floor: event.target.value })}
            placeholder="2. OG"
          />
        </label>
        <label className="field">
          Fläche in m²
          <input
            inputMode="decimal"
            value={form.areaSqm}
            onChange={(event) => onChange({ ...form, areaSqm: event.target.value })}
            required
          />
        </label>
        <label className="field">
          Einheitengewicht
          <input
            inputMode="decimal"
            value={form.unitWeight}
            onChange={(event) => onChange({ ...form, unitWeight: event.target.value })}
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
