import { ConfirmButton } from '../../components/Common';
import type { Property, Unit } from '../../types';

type PropertyStripProps = {
  properties: Property[];
  units: Unit[];
  selectedPropertyId: number | null;
  onEdit: (property: Property) => void;
  onDelete: (property: Property) => void | Promise<void>;
};

export default function PropertyStrip({
  properties,
  units,
  selectedPropertyId,
  onEdit,
  onDelete,
}: PropertyStripProps) {
  return (
    <section className="property-strip">
      {properties.map((property) => {
        const unitCount = units.filter((unit) => unit.propertyId === property.id).length;
        return (
          <article
            key={property.id}
            className={property.id === selectedPropertyId ? 'selected' : ''}
          >
            <div className="house-glyph" aria-hidden="true">
              ⌂
            </div>
            <div>
              <strong>{property.name}</strong>
              <span>{property.address || 'Adresse noch offen'}</span>
              <small>
                {unitCount} Wohnung{unitCount === 1 ? '' : 'en'}
              </small>
            </div>
            <span className="row-actions">
              <button
                className="icon-button"
                type="button"
                aria-label={`Haus ${property.name} bearbeiten`}
                title="Haus bearbeiten"
                onClick={() => onEdit(property)}
              >
                ✎
              </button>
              <ConfirmButton
                className="icon-button danger"
                question={`Haus „${property.name}“ mit allen noch veränderbaren Unterdaten löschen? Abgeschlossene Abrechnungen verhindern die Löschung.`}
                onConfirm={() => onDelete(property)}
              >
                ×
              </ConfirmButton>
            </span>
          </article>
        );
      })}
    </section>
  );
}
