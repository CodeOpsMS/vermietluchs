import { Notice } from '../../components/Common';
import type { SettlementPreview } from '../../types';

type SettlementNoticesProps = {
  pendingCostCount: number;
  preview: SettlementPreview | null;
};

export default function SettlementNotices({ pendingCostCount, preview }: SettlementNoticesProps) {
  return (
    <>
      {pendingCostCount > 0 && !preview && (
        <Notice kind="warning">
          <strong>
            {pendingCostCount} Kostenposition{pendingCostCount === 1 ? '' : 'en'} mit Prüfung offen.
          </strong>{' '}
          Die Vorschau zeigt, ob diese Positionen den Abschluss blockieren.
        </Notice>
      )}
      {preview?.closed && (
        <Notice kind="success">
          <strong>Diese Abrechnung ist abgeschlossen.</strong> Die Druckansicht verwendet den
          gespeicherten Snapshot{preview.snapshotId ? ` Nr. ${preview.snapshotId}` : ''}.
        </Notice>
      )}
      {(preview?.blockingReasons.length ?? 0) > 0 && (
        <Notice kind="warning">
          <strong>Abschluss noch nicht möglich:</strong>
          <ul>
            {preview?.blockingReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </Notice>
      )}
      {(preview?.warnings.length ?? 0) > 0 && (
        <Notice kind="warning">
          <strong>Bitte vor dem Abschluss prüfen:</strong>
          <ul>
            {preview?.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Notice>
      )}
      {(preview?.notes.length ?? 0) > 0 && (
        <Notice>
          <strong>Hinweise zur Berechnung:</strong>
          <ul>
            {preview?.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Notice>
      )}
    </>
  );
}
