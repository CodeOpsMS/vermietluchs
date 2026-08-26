import type { Tenancy, Unit } from '../../types';

type SettlementControlsProps = {
  eligibleTenancies: Tenancy[];
  units: Unit[];
  tenancyId: number | null;
  roundingText: string;
  roundingGroup: string;
  availableGroups: string[];
  loading: boolean;
  hasPreview: boolean;
  onTenancyChange: (tenancyId: number | null) => void;
  onRoundingTextChange: (value: string) => void;
  onRoundingGroupChange: (value: string) => void;
  onCreatePreview: () => void;
};

export default function SettlementControls({
  eligibleTenancies,
  units,
  tenancyId,
  roundingText,
  roundingGroup,
  availableGroups,
  loading,
  hasPreview,
  onTenancyChange,
  onRoundingTextChange,
  onRoundingGroupChange,
  onCreatePreview,
}: SettlementControlsProps) {
  return (
    <section className="card no-print settlement-select settlement-controls">
      <label className="field">
        Mietverhältnis
        <select
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
      <label className="field">
        Rundungsdifferenz
        <input
          inputMode="decimal"
          value={roundingText}
          onChange={(event) => onRoundingTextChange(event.target.value)}
          aria-describedby="rounding-help"
        />
        <small id="rounding-help">Euro, −10,00 bis 10,00</small>
      </label>
      <label className="field">
        Rundungsgruppe
        <input
          list="settlement-rounding-groups"
          maxLength={100}
          value={roundingGroup}
          onChange={(event) => onRoundingGroupChange(event.target.value)}
          required
        />
        <datalist id="settlement-rounding-groups">
          {availableGroups.map((group) => (
            <option key={group} value={group} />
          ))}
        </datalist>
        <small>Vorschlag wählen oder eigene Gruppe eingeben</small>
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
