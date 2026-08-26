import { euro } from '../../format';

type RentMetricsProps = {
  totalDue: number;
  totalPaid: number;
  totalUtilityPaid: number;
  accountBalance: number;
};

export default function RentMetrics({
  totalDue,
  totalPaid,
  totalUtilityPaid,
  accountBalance,
}: RentMetricsProps) {
  return (
    <section className="metrics-grid">
      <article className="metric">
        <span>Jahressoll</span>
        <strong>{euro(totalDue)}</strong>
        <small>Kaltmiete, NK und Garage</small>
      </article>
      <article className="metric metric-primary">
        <span>Eingegangen</span>
        <strong>{euro(totalPaid)}</strong>
        <small>tatsächlich gebucht</small>
      </article>
      <article className="metric">
        <span>IST Nebenkosten</span>
        <strong>{euro(totalUtilityPaid)}</strong>
        <small>Wohnung und Garage für Abrechnung</small>
      </article>
      <article className={`metric ${accountBalance > 0 ? 'metric-warning' : ''}`}>
        <span>Kontosaldo (Soll − Ist)</span>
        <strong>{euro(accountBalance)}</strong>
        <small>
          {accountBalance > 0
            ? 'offener Betrag'
            : accountBalance < 0
              ? 'Überzahlung / Guthaben'
              : 'Konto ausgeglichen'}
        </small>
      </article>
    </section>
  );
}
