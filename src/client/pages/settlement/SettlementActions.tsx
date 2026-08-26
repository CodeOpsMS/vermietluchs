import type { SettlementPreview } from '../../types';

type SettlementActionsProps = {
  preview: SettlementPreview;
  busy: boolean;
  onPrint: () => void;
  onCorrect: () => void;
  onClose: () => void;
};

export default function SettlementActions({
  preview,
  busy,
  onPrint,
  onCorrect,
  onClose,
}: SettlementActionsProps) {
  if (preview.closed) {
    return (
      <>
        <button className="btn btn-secondary" type="button" onClick={onPrint}>
          Drucken / PDF
        </button>
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={onCorrect}>
          Zur Korrektur öffnen
        </button>
      </>
    );
  }

  return (
    <button
      className="btn btn-primary"
      type="button"
      disabled={!preview.canClose || busy}
      onClick={onClose}
    >
      Abrechnung abschließen
    </button>
  );
}
