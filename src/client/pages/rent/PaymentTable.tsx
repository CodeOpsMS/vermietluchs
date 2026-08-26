import { ConfirmButton, EmptyState, StatusPill } from '../../components/Common';
import { dateDe, euro } from '../../format';
import type { Payment, Tenancy, Unit } from '../../types';
import { getPaidParts } from './paymentModel';

type PaymentTableProps = {
  year: number;
  payments: Payment[];
  tenancies: Tenancy[];
  units: Unit[];
  totalDue: number;
  totalPaid: number;
  totalUtilityPaid: number;
  accountBalance: number;
  canGenerate: boolean;
  onGenerate: () => void;
  onEdit: (payment: Payment) => void;
  onDelete: (payment: Payment) => void | Promise<void>;
};

export default function PaymentTable({
  year,
  payments,
  tenancies,
  units,
  totalDue,
  totalPaid,
  totalUtilityPaid,
  accountBalance,
  canGenerate,
  onGenerate,
  onEdit,
  onDelete,
}: PaymentTableProps) {
  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Monatsraster</p>
          <h2>Soll und Ist</h2>
        </div>
        <StatusPill tone={accountBalance > 0 ? 'warn' : 'good'}>
          {accountBalance > 0 ? 'offen' : accountBalance < 0 ? 'Guthaben' : 'ausgeglichen'}
        </StatusPill>
      </div>

      {payments.length === 0 && (
        <EmptyState
          title="Noch keine Monatsbuchungen"
          action={
            <button
              className="btn btn-primary"
              type="button"
              disabled={!canGenerate}
              onClick={onGenerate}
            >
              Jahressoll {year} erzeugen
            </button>
          }
        >
          Vermietluchs übernimmt die Monatsbeträge in einem Schritt aus den Mietverträgen. Danach
          erfasst du die tatsächliche Aufteilung jeder Zahlung.
        </EmptyState>
      )}

      {payments.length > 0 && (
        <div className="table-wrap">
          <table className="data-table ledger-table">
            <thead>
              <tr>
                <th>Fälligkeit</th>
                <th>Mieter / Wohnung</th>
                <th className="number-cell">Soll Kalt</th>
                <th className="number-cell">Soll NK</th>
                <th className="number-cell">Soll gesamt</th>
                <th className="number-cell">Ist gesamt</th>
                <th className="number-cell">davon IST-NK</th>
                <th>Status</th>
                <th className="actions-cell no-print">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => {
                const tenancy = tenancies.find((item) => item.id === payment.tenancyId);
                const unit = units.find((item) => item.id === tenancy?.unitId);
                const due = payment.baseRentDue + payment.utilityDue + payment.garageDue;
                const parts = getPaidParts(payment);
                const utilityPaid = parts.utilityPaid + parts.garagePaid;
                const status =
                  payment.amountPaid >= due ? 'paid' : payment.amountPaid > 0 ? 'partial' : 'open';

                return (
                  <tr key={payment.id}>
                    <td>
                      <strong>{dateDe(payment.dueDate)}</strong>
                      {payment.paidDate && <small>Eingang {dateDe(payment.paidDate)}</small>}
                    </td>
                    <td>
                      <strong>{tenancy?.tenantName ?? 'Gelöschtes Mietverhältnis'}</strong>
                      <small>{unit?.name ?? '—'}</small>
                    </td>
                    <td className="number-cell">{euro(payment.baseRentDue)}</td>
                    <td className="number-cell">{euro(payment.utilityDue + payment.garageDue)}</td>
                    <td className="number-cell">
                      <strong>{euro(due)}</strong>
                    </td>
                    <td className="number-cell">
                      <strong>{euro(payment.amountPaid)}</strong>
                    </td>
                    <td className="number-cell">
                      <strong>{euro(utilityPaid)}</strong>
                      <small>
                        NK {euro(parts.utilityPaid)} · Garage {euro(parts.garagePaid)}
                      </small>
                    </td>
                    <td>
                      <StatusPill
                        tone={status === 'paid' ? 'good' : status === 'partial' ? 'warn' : 'bad'}
                      >
                        {status === 'paid'
                          ? 'bezahlt'
                          : status === 'partial'
                            ? 'teilweise'
                            : 'offen'}
                      </StatusPill>
                    </td>
                    <td className="actions-cell no-print">
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`Buchung vom ${dateDe(payment.dueDate)} bearbeiten`}
                        title="Buchung bearbeiten"
                        onClick={() => onEdit(payment)}
                      >
                        ✎
                      </button>
                      <ConfirmButton
                        className="icon-button danger"
                        question={`Buchung vom ${dateDe(payment.dueDate)} löschen?`}
                        onConfirm={() => onDelete(payment)}
                      >
                        ×
                      </ConfirmButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Summe {year}</td>
                <td className="number-cell">{euro(totalDue)}</td>
                <td className="number-cell">{euro(totalPaid)}</td>
                <td className="number-cell">{euro(totalUtilityPaid)}</td>
                <td colSpan={2}>
                  {accountBalance > 0
                    ? `${euro(accountBalance)} offen`
                    : accountBalance < 0
                      ? `${euro(accountBalance)} Guthaben`
                      : 'ausgeglichen'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
