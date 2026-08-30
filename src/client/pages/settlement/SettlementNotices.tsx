import { Notice } from '../../components/Common';
import { textDatesDe } from '../../format';
import type { SettlementPreview } from '../../types';

type SettlementNoticesProps = {
  pendingCostCount: number;
  preview: SettlementPreview | null;
  isCorrection: boolean;
};

export default function SettlementNotices({
  pendingCostCount,
  preview,
  isCorrection,
}: SettlementNoticesProps) {
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
          gespeicherten Stand{preview.snapshotId ? ` Nr. ${preview.snapshotId}` : ''}. Auch die
          Vermieterdaten sind darin fest gespeichert. Wenn sie geändert werden sollen, öffne die
          Abrechnung oben ausdrücklich zur Korrektur.
        </Notice>
      )}
      {preview?.closed && preview.roundingDifference !== 0 && (
        <Notice kind="warning">
          <strong>Älterer Abrechnungsstand:</strong> Dieser Abschluss enthält noch eine manuelle
          Excel-Rundungsdifferenz. Öffne ihn zur Korrektur, damit die App ihn ohne diesen Zusatzcent
          neu berechnet.
        </Notice>
      )}
      {isCorrection && preview && !preview.closed && (
        <Notice kind="warning">
          <strong>Korrekturvorschau:</strong> Der bisherige Abschluss bleibt im Archiv erhalten. Er
          wird erst ersetzt, wenn du diese Vorschau erneut abschließt. Drucken ist bis dahin
          gesperrt.
        </Notice>
      )}
      {(preview?.blockingReasons.length ?? 0) > 0 && (
        <Notice kind="warning">
          <strong>Abschluss noch nicht möglich:</strong>
          <ul>
            {preview?.blockingReasons.map((reason) => (
              <li key={reason}>{textDatesDe(reason)}</li>
            ))}
          </ul>
        </Notice>
      )}
      {(preview?.warnings.length ?? 0) > 0 && (
        <Notice kind="warning">
          <strong>Bitte vor dem Abschluss prüfen:</strong>
          <ul>
            {preview?.warnings.map((warning) => (
              <li key={warning}>{textDatesDe(warning)}</li>
            ))}
          </ul>
        </Notice>
      )}
      {(preview?.notes.length ?? 0) > 0 && (
        <Notice>
          <strong>Hinweise zur Berechnung:</strong>
          <ul>
            {preview?.notes.map((note) => (
              <li key={note}>{textDatesDe(note)}</li>
            ))}
          </ul>
        </Notice>
      )}
    </>
  );
}
