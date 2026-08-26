import { ConfirmButton, EmptyState, StatusPill } from '../../components/Common';
import { euro } from '../../format';
import type { Cost, Tenancy, Unit } from '../../types';
import { KEY_LABEL, METER_LABEL, STATUS_LABEL, type CostView } from './cost-model';

type CostListProps = {
  view: CostView;
  costs: Cost[];
  units: Unit[];
  tenancies: Tenancy[];
  onViewChange: (view: CostView) => void;
  onCreate: () => void;
  onEdit: (cost: Cost) => void;
  onDelete: (cost: Cost) => void | Promise<void>;
};

export function CostList({
  view,
  costs,
  units,
  tenancies,
  onViewChange,
  onCreate,
  onEdit,
  onDelete,
}: CostListProps) {
  const includedCount = costs.filter((cost) => cost.tenantStatus === 'included').length;
  const pendingCount = costs.filter((cost) => cost.tenantStatus === 'pending').length;
  const shownCosts =
    view === 'internal'
      ? costs
      : view === 'external'
        ? costs.filter((cost) => cost.tenantStatus === 'included')
        : costs.filter((cost) => cost.tenantStatus === 'pending');

  return (
    <section className="card">
      <div className="segmented" role="group" aria-label="Kostensicht auswählen">
        <button
          className={view === 'internal' ? 'active' : ''}
          onClick={() => onViewChange('internal')}
        >
          Intern · alle <span>{costs.length}</span>
        </button>
        <button
          className={view === 'external' ? 'active' : ''}
          onClick={() => onViewChange('external')}
        >
          Extern · Mieter <span>{includedCount}</span>
        </button>
        <button
          className={view === 'pending' ? 'active' : ''}
          onClick={() => onViewChange('pending')}
        >
          Prüfung offen <span>{pendingCount}</span>
        </button>
      </div>

      {shownCosts.length === 0 && (
        <EmptyState
          title={view === 'pending' ? 'Keine offenen Prüffälle' : 'Noch keine Kosten'}
          action={
            view !== 'pending' ? (
              <button className="btn btn-primary" onClick={onCreate}>
                Erste Position erfassen
              </button>
            ) : undefined
          }
        >
          {view === 'external'
            ? 'Freigegebene Kosten erscheinen hier und später in der Mieterabrechnung.'
            : 'Für dieses Jahr gibt es in dieser Sicht nichts zu zeigen.'}
        </EmptyState>
      )}

      {shownCosts.length > 0 && (
        <div className="table-wrap">
          <table className="data-table cost-table">
            <thead>
              <tr>
                <th>Position</th>
                <th>Status</th>
                <th>Gruppe &amp; Verteilung</th>
                {view === 'internal' && <th className="number-cell">Original</th>}
                <th className="number-cell">Umlagefähig</th>
                <th className="actions-cell no-print">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {shownCosts.map((cost) => {
                const unit = units.find((item) => item.id === cost.directUnitId);
                const tenancy = tenancies.find((item) => item.id === cost.directTenancyId);
                return (
                  <tr key={cost.id}>
                    <td>
                      <strong>
                        {view === 'external' && cost.descriptionTenant
                          ? cost.descriptionTenant
                          : cost.descriptionInternal}
                      </strong>
                      {view === 'internal' && cost.descriptionTenant && (
                        <small>Mietertext: {cost.descriptionTenant}</small>
                      )}
                      {cost.notes && <small>{cost.notes}</small>}
                    </td>
                    <td>
                      <StatusPill
                        tone={
                          cost.tenantStatus === 'included'
                            ? 'good'
                            : cost.tenantStatus === 'pending'
                              ? 'warn'
                              : 'muted'
                        }
                      >
                        {STATUS_LABEL[cost.tenantStatus]}
                      </StatusPill>
                    </td>
                    <td>
                      <strong>{cost.statementGroup}</strong>
                      <small>
                        {cost.allocationMode === 'fixedTenancy'
                          ? `Fester Anteil · ${tenancy?.tenantName ?? 'Mieter'}`
                          : `${KEY_LABEL[cost.allocationKey]}${unit ? ` · ${unit.name}` : ''}${cost.meterType ? ` · ${METER_LABEL[cost.meterType]}` : ''}`}
                      </small>
                    </td>
                    {view === 'internal' && (
                      <td className="number-cell">{euro(cost.sourceAmount)}</td>
                    )}
                    <td className="number-cell">
                      <strong>{euro(cost.allocableAmount)}</strong>
                      {cost.labor35a > 0 && <small>davon §35a {euro(cost.labor35a)}</small>}
                    </td>
                    <td className="actions-cell no-print">
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`Kostenposition ${cost.descriptionInternal} bearbeiten`}
                        onClick={() => onEdit(cost)}
                        title="Bearbeiten"
                      >
                        ✎
                      </button>
                      <ConfirmButton
                        className="icon-button danger"
                        question={`Kostenposition „${cost.descriptionInternal}“ löschen?`}
                        onConfirm={() => onDelete(cost)}
                      >
                        ×
                      </ConfirmButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
