import { METER_TYPES } from '../../../shared/constants';
import { FieldError, FormActions, Modal, SaveForm } from '../../components/Common';
import type { MeterType, Unit } from '../../types';
import { TYPE_LABEL, TYPE_UNIT, type MeterForm } from './meter-model';

type MeterFormModalProps = {
  form: MeterForm;
  units: Unit[];
  error: string;
  busy: boolean;
  onChange: (form: MeterForm) => void;
  onSave: () => void | Promise<void>;
  onClose: () => void;
};

export function MeterFormModal({
  form,
  units,
  error,
  busy,
  onChange,
  onSave,
  onClose,
}: MeterFormModalProps) {
  return (
    <Modal title={form.id ? 'Zähler bearbeiten' : 'Zähler anlegen'} onClose={onClose}>
      <SaveForm className="form-grid" onSubmit={onSave}>
        <label className="field span-2">
          Wohnung
          <select
            value={form.unitId}
            onChange={(event) => onChange({ ...form, unitId: event.target.value })}
            required
          >
            <option value="">Bitte wählen</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field span-2">
          Bezeichnung
          <input
            autoFocus
            value={form.name}
            onChange={(event) => onChange({ ...form, name: event.target.value })}
            placeholder="z. B. Kaltwasser Küche"
            required
          />
        </label>
        <label className="field">
          Zählernummer
          <input
            value={form.meterNumber}
            onChange={(event) => onChange({ ...form, meterNumber: event.target.value })}
          />
        </label>
        <label className="field">
          Art
          <select
            value={form.type}
            onChange={(event) => {
              const type = event.target.value as MeterType;
              onChange({
                ...form,
                type,
                unitLabel: form.id ? form.unitLabel : TYPE_UNIT[type],
              });
            }}
          >
            {METER_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Maßeinheit
          <input
            value={form.unitLabel}
            onChange={(event) => onChange({ ...form, unitLabel: event.target.value })}
            required
          />
        </label>
        <FieldError>{error}</FieldError>
        <FormActions busy={busy} onCancel={onClose} />
      </SaveForm>
    </Modal>
  );
}
