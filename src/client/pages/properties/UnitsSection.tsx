import { ConfirmButton, EmptyState, StatusPill } from '../../components/Common';
import { dateDe, euro, today } from '../../format';
import type { Property, Tenancy, Unit } from '../../types';

type UnitsSectionProps = {
  property: Property;
  units: Unit[];
  tenanciesByUnit: Map<number, Tenancy[]>;
  onAddUnit: () => void;
  onEditUnit: (unit: Unit) => void;
  onDeleteUnit: (unit: Unit) => void | Promise<void>;
  onAddTenancy: (unit: Unit) => void;
  onEditTenancy: (tenancy: Tenancy) => void;
  onDeleteTenancy: (tenancy: Tenancy) => void | Promise<void>;
  onChangeover: (tenancy: Tenancy) => void;
};

export default function UnitsSection({
  property,
  units,
  tenanciesByUnit,
  onAddUnit,
  onEditUnit,
  onDeleteUnit,
  onAddTenancy,
  onEditTenancy,
  onDeleteTenancy,
  onChangeover,
}: UnitsSectionProps) {
  const currentDate = today();

  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{property.address || 'Anschrift ergänzen'}</p>
          <h2>{property.name}</h2>
        </div>
        <button className="btn btn-secondary" onClick={onAddUnit}>
          + Wohnung
        </button>
      </div>

      {units.length === 0 && (
        <EmptyState
          title="Keine Wohnungen"
          action={
            <button className="btn btn-primary" onClick={onAddUnit}>
              Erste Wohnung anlegen
            </button>
          }
        >
          Lege alle Einheiten an, die an der Kostenverteilung teilnehmen.
        </EmptyState>
      )}

      <div className="unit-grid">
        {units.map((unit) => {
          const tenancies = tenanciesByUnit.get(unit.id) ?? [];
          const currentTenancy = tenancies.find(
            (tenancy) =>
              tenancy.startDate <= currentDate &&
              (!tenancy.endDate || tenancy.endDate >= currentDate),
          );

          return (
            <article className="unit-card" key={unit.id}>
              <header>
                <div>
                  <small>{unit.floor || 'Etage offen'}</small>
                  <h3>{unit.name}</h3>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Wohnung ${unit.name} bearbeiten`}
                  title="Wohnung bearbeiten"
                  onClick={() => onEditUnit(unit)}
                >
                  ✎
                </button>
              </header>

              <div className="unit-facts">
                <span>
                  <b>{unit.areaSqm.toLocaleString('de-DE')} m²</b> Fläche
                </span>
                <span>
                  <b>{unit.unitWeight}</b> Einheitengewicht
                </span>
              </div>

              <div className="tenant-current">
                {currentTenancy ? (
                  <>
                    <StatusPill tone="good">vermietet</StatusPill>
                    <strong>{currentTenancy.tenantName}</strong>
                    <small>
                      seit {dateDe(currentTenancy.startDate)} · {euro(currentTenancy.baseRent)} kalt
                      + {euro(currentTenancy.utilityPrepayment)} NK
                    </small>
                  </>
                ) : (
                  <>
                    <StatusPill tone="muted">frei</StatusPill>
                    <strong>Kein laufendes Mietverhältnis</strong>
                  </>
                )}
              </div>

              {tenancies.length > 0 && (
                <details>
                  <summary>Mietverlauf ({tenancies.length})</summary>
                  <div className="history-list">
                    {tenancies.map((tenancy) => (
                      <div key={tenancy.id}>
                        <span>
                          <strong>{tenancy.tenantName}</strong>
                          <small>
                            {dateDe(tenancy.startDate)} – {dateDe(tenancy.endDate)}
                          </small>
                        </span>
                        <span className="row-actions">
                          <button className="text-button" onClick={() => onEditTenancy(tenancy)}>
                            Bearbeiten
                          </button>
                          {tenancy.startDate <= currentDate &&
                            (!tenancy.endDate || tenancy.endDate >= currentDate) && (
                              <button className="text-button" onClick={() => onChangeover(tenancy)}>
                                Mieterwechsel
                              </button>
                            )}
                          <ConfirmButton
                            className="icon-button danger"
                            question={`Mietverhältnis „${tenancy.tenantName}“ samt Zahlungen löschen?`}
                            onConfirm={() => onDeleteTenancy(tenancy)}
                          >
                            ×
                          </ConfirmButton>
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              <footer>
                <button className="btn btn-secondary btn-small" onClick={() => onAddTenancy(unit)}>
                  + Mietverhältnis
                </button>
                <ConfirmButton
                  question={`Wohnung „${unit.name}“ mit allen Mietverhältnissen löschen?`}
                  onConfirm={() => onDeleteUnit(unit)}
                >
                  Löschen
                </ConfirmButton>
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}
