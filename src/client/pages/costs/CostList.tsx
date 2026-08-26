import { ConfirmButton, EmptyState, StatusPill } from '../../components/Common';
import { euro } from '../../format';
import type { Cost, Tenancy, Unit } from '../../types';
import {
  createExternalCostGroups,
  KEY_LABEL,
  METER_LABEL,
  STATUS_LABEL,
  type CostView,
} from './cost-model';

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
  const pendingCount = costs.filter((cost) => cost.tenantStatus === 'pending').length;
  const externalGroups = createExternalCostGroups(costs);
  const shownCosts =
    view === 'pending' ? costs.filter((cost) => cost.tenantStatus === 'pending') : costs;
  const shownCount = view === 'external' ? externalGroups.length : shownCosts.length;
  const externalTotal = externalGroups.reduce((sum, group) => sum + group.allocableAmount, 0);

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
          Extern · Mieter <span>{externalGroups.length}</span>
        </button>
        <button
          className={view === 'pending' ? 'active' : ''}
          onClick={() => onViewChange('pending')}
        >
          Prüfung offen <span>{pendingCount}</span>
        </button>
      </div>

      {shownCount === 0 && (
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
            ? 'Hier erscheinen die für den Mieter vorgesehenen Sammelpositionen.'
            : 'Für dieses Jahr gibt es in dieser Sicht nichts zu zeigen.'}
        </EmptyState>
      )}

      {view === 'external' && externalGroups.length > 0 && (
        <div className="table-wrap">
          <table className="data-table cost-table">
            <thead>
              <tr>
                <th>Sammelposition</th>
                <th className="number-cell">Umlagefähig</th>
              </tr>
            </thead>
            <tbody>
              {externalGroups.map((group) => (
                <tr key={group.name}>
                  <td>
                    <strong>{group.name}</strong>
                    <small>
                      {group.costCount} interne Position
                      {group.costCount === 1 ? '' : 'en'} zusammengefasst
                    </small>
                  </td>
                  <td className="number-cell">
                    <strong>{euro(group.allocableAmount)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Gesamt</td>
                <td className="number-cell">
                  <strong>{euro(externalTotal)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {view !== 'external' && shownCosts.length > 0 && (
        <div className="table-wrap">
          <table className="data-table cost-table">
            <thead>
              <tr>
                <th>Position</th>
                <th>Status</th>
                <th>Sammelposition &amp; Verteilung</th>
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
                      <strong>{cost.descriptionInternal}</strong>
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
