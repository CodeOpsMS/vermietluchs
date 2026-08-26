import { FieldError, FormActions, Modal, SaveForm } from '../../components/Common';
import { euro } from '../../format';
import type { Tenancy, Unit } from '../../types';
import type { PaymentForm } from './paymentModel';

type PaymentModalProps = {
  form: PaymentForm;
  activeTenancies: Tenancy[];
  units: Unit[];
  formTotal: number | null;
  error: string;
  busy: boolean;
  onChange: (form: PaymentForm) => void;
  onSelectTenancy: (tenancyId: string) => void;
  onSave: () => void | Promise<void>;
  onClose: () => void;
};

export default function PaymentModal({
  form,
  activeTenancies,
  units,
  formTotal,
  error,
  busy,
  onChange,
  onSelectTenancy,
  onSave,
  onClose,
}: PaymentModalProps) {
  return (
    <Modal wide title={form.id ? 'Buchung bearbeiten' : 'Zahlung erfassen'} onClose={onClose}>
      <SaveForm className="form-grid" onSubmit={onSave}>
        <label className="field span-2">
          Mietverhältnis
          <select
            value={form.tenancyId}
            onChange={(event) => onSelectTenancy(event.target.value)}
            required
          >
            <option value="">Bitte wählen</option>
            {activeTenancies.map((tenancy) => (
              <option key={tenancy.id} value={tenancy.id}>
                {tenancy.tenantName} · {units.find((unit) => unit.id === tenancy.unitId)?.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Fälligkeit
          <input
            type="date"
            value={form.dueDate}
            onChange={(event) => onChange({ ...form, dueDate: event.target.value })}
            required
          />
        </label>
        <label className="field">
          Zahlungseingang
          <input
            type="date"
            value={form.paidDate}
            onChange={(event) => onChange({ ...form, paidDate: event.target.value })}
          />
        </label>

        <div className="form-section span-2">
          <strong>Vertragliches Soll</strong>
          <small>Diese Beträge werden aus dem Mietvertrag vorgeschlagen.</small>
        </div>
        <label className="field">
          Kaltmiete Soll
          <input
            inputMode="decimal"
            value={form.baseRentDue}
            onChange={(event) => onChange({ ...form, baseRentDue: event.target.value })}
            required
          />
        </label>
        <label className="field">
          Nebenkosten Soll
          <input
            inputMode="decimal"
            value={form.utilityDue}
            onChange={(event) => onChange({ ...form, utilityDue: event.target.value })}
            required
          />
        </label>
        <label className="field">
          Garage Soll
          <input
            inputMode="decimal"
            value={form.garageDue}
            onChange={(event) => onChange({ ...form, garageDue: event.target.value })}
            required
          />
        </label>

        <div className="form-section span-2">
          <strong>Tatsächlicher Zahlungseingang</strong>
          <small>
            Die Nebenkostenabrechnung berücksichtigt nur diese tatsächlich gezahlten NK- und
            Garagenanteile.
          </small>
        </div>
        <label className="field">
          Davon Kaltmiete
          <input
            autoFocus
            inputMode="decimal"
            value={form.baseRentPaid}
            onChange={(event) => onChange({ ...form, baseRentPaid: event.target.value })}
            required
          />
        </label>
        <label className="field">
          Davon Nebenkosten
          <input
            inputMode="decimal"
            value={form.utilityPaid}
            onChange={(event) => onChange({ ...form, utilityPaid: event.target.value })}
            required
          />
        </label>
        <label className="field">
          Davon Garage
          <input
            inputMode="decimal"
            value={form.garagePaid}
            onChange={(event) => onChange({ ...form, garagePaid: event.target.value })}
            required
          />
        </label>
        <label className="field calculated-field">
          Zahlung gesamt
          <input
            value={formTotal === null ? 'Bitte Teilbeträge prüfen' : euro(formTotal)}
            readOnly
            aria-live="polite"
          />
          <small>Wird automatisch aus den drei Istbeträgen berechnet.</small>
        </label>
        <label className="field span-2">
          Notiz
          <textarea
            value={form.note}
            onChange={(event) => onChange({ ...form, note: event.target.value })}
          />
        </label>
        <FieldError>{error}</FieldError>
        <FormActions busy={busy} onCancel={onClose} />
      </SaveForm>
    </Modal>
  );
}
