import { ALLOCATION_KEYS, METER_TYPES } from '../../../shared/constants';
import { FieldError, FormActions, Modal, Notice, SaveForm } from '../../components/Common';
import type {
  AllocationKey,
  AllocationMode,
  MeterType,
  Tenancy,
  TenantStatus,
  Unit,
} from '../../types';
import { KEY_LABEL, METER_LABEL, type CostForm } from './cost-model';

type CostFormModalProps = {
  form: CostForm;
  statementGroups: string[];
  units: Unit[];
  tenancies: Tenancy[];
  error: string;
  busy: boolean;
  onChange: (form: CostForm) => void;
  onSave: () => void | Promise<void>;
  onClose: () => void;
};

export function CostFormModal({
  form,
  statementGroups,
  units,
  tenancies,
  error,
  busy,
  onChange,
  onSave,
  onClose,
}: CostFormModalProps) {
  return (
    <Modal
      wide
      title={form.id ? 'Kostenposition bearbeiten' : 'Kostenposition erfassen'}
      onClose={onClose}
    >
      <SaveForm className="form-grid" onSubmit={onSave}>
        <label className="field span-2">
          Interne Bezeichnung
          <input
            autoFocus
            value={form.descriptionInternal}
            onChange={(event) => onChange({ ...form, descriptionInternal: event.target.value })}
            placeholder="z. B. WEG-Abrechnung · Heizkosten Wohnung"
            required
          />
          <small>Nur intern sichtbar; darf genau und technisch sein.</small>
        </label>
        <label className="field span-2">
          Bezeichnung für den Mieter
          <input
            value={form.descriptionTenant}
            onChange={(event) => onChange({ ...form, descriptionTenant: event.target.value })}
            placeholder="z. B. Heizkosten"
          />
          <small>Leer lassen, um die interne Bezeichnung zu verwenden.</small>
        </label>
        <label className="field">
          Originalbetrag
          <input
            inputMode="decimal"
            value={form.sourceAmount}
            onChange={(event) => {
              const sourceAmount = event.target.value;
              onChange({
                ...form,
                sourceAmount,
                allocableAmount: form.allocableAmount || sourceAmount,
              });
            }}
            required
          />
        </label>
        <label className="field">
          Umlagefähiger Betrag
          <input
            inputMode="decimal"
            disabled={form.tenantStatus === 'excluded'}
            value={form.tenantStatus === 'excluded' ? '0' : form.allocableAmount}
            onChange={(event) => onChange({ ...form, allocableAmount: event.target.value })}
            required
          />
        </label>
        <label className="field">
          Mieterstatus
          <select
            value={form.tenantStatus}
            onChange={(event) =>
              onChange({
                ...form,
                tenantStatus: event.target.value as TenantStatus,
              })
            }
          >
            <option value="included">Umlagefähig</option>
            <option value="excluded">Nicht umlagefähig</option>
            <option value="pending">Prüfung offen</option>
          </select>
        </label>
        <label className="field">
          Abrechnungsgruppe
          <input
            list="cost-statement-groups"
            maxLength={100}
            value={form.statementGroup}
            onChange={(event) => onChange({ ...form, statementGroup: event.target.value })}
            required
          />
          <datalist id="cost-statement-groups">
            {statementGroups.map((group) => (
              <option key={group} value={group} />
            ))}
          </datalist>
          <small>Vorschlag wählen oder eigene Gruppe eingeben, z. B. „Aufzug“.</small>
        </label>
        <label className="field">
          Berechnungsmodus
          <select
            value={form.allocationMode}
            onChange={(event) => {
              const allocationMode = event.target.value as AllocationMode;
              onChange({
                ...form,
                allocationMode,
                allocationKey: allocationMode === 'fixedTenancy' ? 'direct' : form.allocationKey,
                directUnitId: allocationMode === 'fixedTenancy' ? '' : form.directUnitId,
              });
            }}
          >
            <option value="standard">Normal verteilen</option>
            <option value="fixedTenancy">Fertiger Mieteranteil</option>
          </select>
          <small>„Fertiger Anteil“ wird nicht nochmals zeitanteilig gekürzt.</small>
        </label>
        <label className="field">
          Umlageschlüssel
          <select
            disabled={form.allocationMode === 'fixedTenancy'}
            value={form.allocationKey}
            onChange={(event) =>
              onChange({
                ...form,
                allocationKey: event.target.value as AllocationKey,
              })
            }
          >
            {ALLOCATION_KEYS.map((key) => (
              <option key={key} value={key}>
                {KEY_LABEL[key]}
              </option>
            ))}
          </select>
        </label>

        {form.allocationMode === 'standard' && form.allocationKey === 'direct' && (
          <label className="field">
            Direkte Wohnung
            <select
              value={form.directUnitId}
              onChange={(event) =>
                onChange({
                  ...form,
                  directUnitId: event.target.value,
                  directTenancyId: event.target.value ? '' : form.directTenancyId,
                })
              }
            >
              <option value="">— keine —</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {(form.allocationMode === 'fixedTenancy' ||
          (form.allocationMode === 'standard' && form.allocationKey === 'direct')) && (
          <label className="field">
            Direktes Mietverhältnis
            <select
              value={form.directTenancyId}
              onChange={(event) =>
                onChange({
                  ...form,
                  directTenancyId: event.target.value,
                  directUnitId: event.target.value ? '' : form.directUnitId,
                })
              }
            >
              <option value="">— keines —</option>
              {tenancies.map((tenancy) => (
                <option key={tenancy.id} value={tenancy.id}>
                  {tenancy.tenantName} · {units.find((unit) => unit.id === tenancy.unitId)?.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {form.allocationKey === 'meter' && (
          <label className="field">
            Zählerart
            <select
              value={form.meterType}
              onChange={(event) =>
                onChange({ ...form, meterType: event.target.value as MeterType })
              }
            >
              <option value="">Bitte wählen</option>
              {METER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {METER_LABEL[type]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          Davon §35a
          <input
            inputMode="decimal"
            value={form.labor35a}
            onChange={(event) => onChange({ ...form, labor35a: event.target.value })}
          />
        </label>
        <label className="field span-2">
          Interne Notiz
          <textarea
            rows={3}
            value={form.notes}
            onChange={(event) => onChange({ ...form, notes: event.target.value })}
            placeholder="Prüfergebnis, Quelle oder Erläuterung"
          />
        </label>
        {form.tenantStatus === 'pending' && (
          <Notice kind="warning">
            Diese Position bleibt intern sichtbar, wird aber bis zur Freigabe nicht in eine
            Mieterabrechnung übernommen.
          </Notice>
        )}
        <FieldError>{error}</FieldError>
        <FormActions busy={busy} onCancel={onClose} />
      </SaveForm>
    </Modal>
  );
}
