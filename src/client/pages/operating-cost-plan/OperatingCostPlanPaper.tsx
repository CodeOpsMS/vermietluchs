import { euro } from '../../format';
import type { OperatingCostPlan, Property, Tenancy, Unit } from '../../types';

export default function OperatingCostPlanPaper({
  plan,
  property,
  tenancy,
  unit,
}: {
  plan: OperatingCostPlan;
  property: Property | undefined;
  tenancy: Tenancy | undefined;
  unit: Unit | undefined;
}) {
  return (
    <article className="card operating-cost-plan-paper">
      <header className="plan-document-header">
        <div>
          <p className="eyebrow">Betriebskostenplanung</p>
          <h2>Betriebskosten nach Wirtschaftsplan {plan.year}</h2>
        </div>
        <dl>
          <div>
            <dt>Objekt</dt>
            <dd>{property?.name ?? '—'}</dd>
          </div>
          <div>
            <dt>Wohnung</dt>
            <dd>{unit?.name ?? '—'}</dd>
          </div>
          <div>
            <dt>Mietverhältnis</dt>
            <dd>{tenancy?.tenantName ?? '—'}</dd>
          </div>
        </dl>
      </header>

      <section className="plan-costs" aria-labelledby="plan-costs-title">
        <h3 id="plan-costs-title">Umlegbare Betriebskosten {plan.year}</h3>
        <dl>
          <div>
            <dt>Wohnung</dt>
            <dd>{euro(plan.housingCosts)}</dd>
          </div>
          <div>
            <dt>Garage</dt>
            <dd>{euro(plan.garageCosts)}</dd>
          </div>
          <div>
            <dt>Grundsteuer</dt>
            <dd>{euro(plan.propertyTax)}</dd>
          </div>
        </dl>
      </section>

      <section className="plan-totals">
        <dl>
          <div>
            <dt>Jahresbetrag</dt>
            <dd>{euro(plan.annualTotal)}</dd>
          </div>
          <div>
            <dt>Monate</dt>
            <dd>{plan.months}</dd>
          </div>
          <div>
            <dt>Rechnerischer Monatsbetrag</dt>
            <dd>{euro(plan.calculatedMonthlyAmount)}</dd>
          </div>
        </dl>
      </section>

      <section className="plan-prepayment">
        <span aria-hidden="true">→</span>
        <div>
          <small>Festgelegte monatliche Vorauszahlung</small>
          <strong>
            {plan.monthlyPrepayment === null
              ? 'Noch nicht festgelegt'
              : euro(plan.monthlyPrepayment)}
          </strong>
          {plan.monthlyDifference !== null && (
            <small>
              {plan.monthlyDifference === 0
                ? 'entspricht dem rechnerischen Monatsbetrag'
                : `${euro(Math.abs(plan.monthlyDifference))} ${plan.monthlyDifference < 0 ? 'unter' : 'über'} dem rechnerischen Monatsbetrag`}
            </small>
          )}
        </div>
      </section>

      {plan.notes && (
        <section className="plan-notes">
          <h3>Notiz</h3>
          <p>{plan.notes}</p>
        </section>
      )}
    </article>
  );
}
