import type { Tenancy, Unit } from '../../types';

type SettlementControlsProps = {
  eligibleTenancies: Tenancy[];
  units: Unit[];
  tenancyId: number | null;
  loading: boolean;
  hasPreview: boolean;
  onTenancyChange: (tenancyId: number | null) => void;
  onCreatePreview: () => void;
};

export default function SettlementControls({
  eligibleTenancies,
  units,
  tenancyId,
  loading,
  hasPreview,
  onTenancyChange,
  onCreatePreview,
}: SettlementControlsProps) {
  return (
    <section className="card no-print settlement-select settlement-controls">
      <label className="field">
        Mietverhältnis
        <select
          disabled={loading}
          value={tenancyId ?? ''}
          onChange={(event) =>
            onTenancyChange(event.target.value ? Number(event.target.value) : null)
          }
        >
          <option value="">Bitte wählen</option>
          {eligibleTenancies.map((tenancy) => (
            <option key={tenancy.id} value={tenancy.id}>
              {tenancy.tenantName} ·{' '}
              {units.find((unit) => unit.id === tenancy.unitId)?.name ?? 'Wohnung'}
            </option>
          ))}
        </select>
      </label>
      <button
        className="btn btn-primary"
        type="button"
        disabled={!tenancyId || loading}
        onClick={onCreatePreview}
      >
        {loading ? 'Berechnet …' : hasPreview ? 'Neu berechnen' : 'Vorschau berechnen'}
      </button>
    </section>
  );
}
