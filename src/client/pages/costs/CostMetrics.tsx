import { euro } from '../../format';
import type { Cost } from '../../types';

export function CostMetrics({ costs }: { costs: Cost[] }) {
  const sourceTotal = costs.reduce((sum, cost) => sum + cost.sourceAmount, 0);
  const externalTotal = costs
    .filter((cost) => cost.tenantStatus === 'included')
    .reduce((sum, cost) => sum + cost.allocableAmount, 0);
  const ownerTotal = costs.reduce((sum, cost) => {
    if (cost.tenantStatus !== 'included') return sum + cost.sourceAmount;
    return sum + Math.max(0, cost.sourceAmount - cost.allocableAmount);
  }, 0);

  return (
    <section className="metrics-grid metrics-three">
      <article className="metric">
        <span>Originalkosten intern</span>
        <strong>{euro(sourceTotal)}</strong>
        <small>{costs.length} Positionen</small>
      </article>
      <article className="metric metric-primary">
        <span>Freigegeben extern</span>
        <strong>{euro(externalTotal)}</strong>
        <small>erscheint in Abrechnungen</small>
      </article>
      <article className="metric">
        <span>Noch nicht umgelegt</span>
        <strong>{euro(ownerTotal)}</strong>
        <small>Prüffälle, ausgeschlossene Kosten und Eigentümeranteile</small>
      </article>
    </section>
  );
}
