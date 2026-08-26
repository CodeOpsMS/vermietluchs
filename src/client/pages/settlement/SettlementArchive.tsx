import { ErrorBox } from '../../components/Common';
import { dateDe } from '../../format';
import type { Tenancy, Unit } from '../../types';
import type { SettlementArchiveItem } from './types';

type SettlementArchiveProps = {
  items: SettlementArchiveItem[];
  tenancies: Tenancy[];
  units: Unit[];
  loading: boolean;
  busySnapshotId: number | null;
  openSnapshotId: number | null;
  error: string;
  onOpen: (snapshotId: number) => void;
};

export default function SettlementArchive({
  items,
  tenancies,
  units,
  loading,
  busySnapshotId,
  openSnapshotId,
  error,
  onOpen,
}: SettlementArchiveProps) {
  return (
    <section
      className="card no-print settlement-archive"
      aria-labelledby="settlement-archive-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Unveränderliche Dokumente</p>
          <h2 id="settlement-archive-title">Abrechnungsarchiv</h2>
        </div>
        <span className="status status-muted">{items.length} abgeschlossen</span>
      </div>

      {error && <ErrorBox message={error} />}
      {loading && (
        <p className="muted-text" role="status">
          Archiv wird geladen …
        </p>
      )}
      {!loading && items.length === 0 && !error && (
        <p className="muted-text">Noch keine abgeschlossene Abrechnung für dieses Haus.</p>
      )}
      {items.length > 0 && (
        <div className="archive-list">
          {items.map((item) => {
            const tenancy = tenancies.find((candidate) => candidate.id === item.tenancyId);
            const unit = units.find((candidate) => candidate.id === tenancy?.unitId);
            const isOpen = openSnapshotId === item.snapshotId;
            return (
              <div key={item.snapshotId}>
                <span>
                  <strong>
                    {item.year} · {tenancy?.tenantName ?? `Mietverhältnis ${item.tenancyId}`}
                  </strong>
                  <small>
                    {unit?.name ? `${unit.name} · ` : ''}abgeschlossen am {dateDe(item.closedAt)} ·
                    Snapshot {item.snapshotId}
                  </small>
                </span>
                <button
                  className="btn btn-secondary btn-small"
                  type="button"
                  disabled={busySnapshotId !== null}
                  onClick={() => onOpen(item.snapshotId)}
                >
                  {busySnapshotId === item.snapshotId ? 'Öffnet …' : isOpen ? 'Geöffnet' : 'Öffnen'}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <small>
        Geöffnete Snapshots können oben über „Drucken / PDF“ unverändert ausgegeben werden.
      </small>
    </section>
  );
}
