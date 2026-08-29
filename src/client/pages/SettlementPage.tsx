import { useEffect, useMemo, useState } from 'react';
import type { PageProps } from '../App';
import { getJson, postJson, postJsonWithRevision } from '../api';
import { EmptyState, ErrorBox, Loading, PageHeader } from '../components/Common';
import { activeInYear } from '../format';
import type { SettlementPreview } from '../types';
import SettlementArchive from './settlement/SettlementArchive';
import SettlementActions from './settlement/SettlementActions';
import SettlementControls from './settlement/SettlementControls';
import SettlementNotices from './settlement/SettlementNotices';
import SettlementPaper from './settlement/SettlementPaper';
import type {
  SettlementArchiveItem,
  SettlementCloseRequest,
  SettlementRequest,
} from './settlement/types';

export default function SettlementPage({ data, propertyId, year }: PageProps) {
  const eligibleTenancies = useMemo(
    () =>
      data.tenancies.filter((tenancy) => activeInYear(tenancy.startDate, tenancy.endDate, year)),
    [data.tenancies, year],
  );
  const eligibleKey = eligibleTenancies.map((tenancy) => tenancy.id).join(',');
  const firstEligibleId = eligibleTenancies[0]?.id ?? null;

  const [tenancyId, setTenancyId] = useState<number | null>(firstEligibleId);
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [archive, setArchive] = useState<SettlementArchiveItem[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveBusyId, setArchiveBusyId] = useState<number | null>(null);
  const [archiveError, setArchiveError] = useState('');
  const [correction, setCorrection] = useState<{
    snapshotId: number;
    revision: number;
  } | null>(null);

  const pendingCostCount = data.costs.filter(
    (cost) => cost.year === (preview?.year ?? year) && cost.tenantStatus === 'pending',
  ).length;
  const selectableTenancies = useMemo(() => {
    const selected = data.tenancies.find((tenancy) => tenancy.id === preview?.tenancyId);
    if (!selected || eligibleTenancies.some((tenancy) => tenancy.id === selected.id)) {
      return eligibleTenancies;
    }
    return [...eligibleTenancies, selected];
  }, [data.tenancies, eligibleTenancies, preview?.tenancyId]);
  useEffect(() => {
    // Nach einem Haus-, Jahres- oder Mietvertragswechsel darf keine alte Auswahl weiterleben.
    void Promise.resolve().then(() => {
      const eligibleIds = new Set(eligibleKey.split(',').filter(Boolean).map(Number));
      setTenancyId((current) =>
        current !== null && eligibleIds.has(current) ? current : firstEligibleId,
      );
      setPreview(null);
      setCorrection(null);
      setError('');
    });
  }, [eligibleKey, firstEligibleId, propertyId, year]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (!propertyId) {
        if (!cancelled) setArchive([]);
        return;
      }
      if (!cancelled) {
        setArchiveLoading(true);
        setArchiveError('');
      }
      try {
        const result = await getJson<SettlementArchiveItem[]>(
          `/api/settlements?propertyId=${propertyId}`,
        );
        if (!cancelled) setArchive(result);
      } catch (reason) {
        if (!cancelled) {
          setArchiveError(
            reason instanceof Error
              ? reason.message
              : 'Abrechnungsarchiv konnte nicht geladen werden.',
          );
        }
      } finally {
        if (!cancelled) setArchiveLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  useEffect(() => {
    if (!propertyId || !tenancyId || archiveLoading || correction !== null || preview !== null) {
      return;
    }
    const matchingSnapshot = archive.find(
      (item) => item.tenancyId === tenancyId && item.year === year,
    );
    if (!matchingSnapshot) return;

    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (!cancelled) {
        setArchiveBusyId(matchingSnapshot.snapshotId);
        setArchiveError('');
      }
      try {
        const snapshot = await getJson<SettlementPreview>(
          `/api/settlements/${matchingSnapshot.snapshotId}?propertyId=${propertyId}`,
        );
        if (!cancelled) {
          setTenancyId(snapshot.tenancyId);
          setPreview(snapshot);
          setCorrection(null);
          setError('');
        }
      } catch (reason) {
        if (!cancelled) {
          setArchiveError(
            reason instanceof Error
              ? reason.message
              : 'Gespeicherte Abrechnung konnte nicht geöffnet werden.',
          );
        }
      } finally {
        setArchiveBusyId((current) => (current === matchingSnapshot.snapshotId ? null : current));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [archive, archiveLoading, correction, preview, propertyId, tenancyId, year]);

  async function refreshArchive(selectedPropertyId: number) {
    try {
      const result = await getJson<SettlementArchiveItem[]>(
        `/api/settlements?propertyId=${selectedPropertyId}`,
      );
      setArchive(result);
      setArchiveError('');
    } catch (reason) {
      setArchiveError(
        reason instanceof Error
          ? reason.message
          : 'Abrechnungsarchiv konnte nicht aktualisiert werden.',
      );
    }
  }

  async function openSnapshot(snapshotId: number) {
    if (!propertyId) return;
    setArchiveBusyId(snapshotId);
    setArchiveError('');
    try {
      const snapshot = await getJson<SettlementPreview>(
        `/api/settlements/${snapshotId}?propertyId=${propertyId}`,
      );
      setTenancyId(snapshot.tenancyId);
      setPreview(snapshot);
      setCorrection(null);
      setError('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (reason) {
      setArchiveError(
        reason instanceof Error
          ? reason.message
          : 'Abrechnungssnapshot konnte nicht geöffnet werden.',
      );
    } finally {
      setArchiveBusyId(null);
    }
  }

  function requestBody(): SettlementRequest | null {
    if (preview) {
      return {
        propertyId: preview.propertyId,
        tenancyId: preview.tenancyId,
        year: preview.year,
      };
    }
    if (!propertyId || !tenancyId) {
      setError('Bitte zuerst Haus und Mietverhältnis auswählen.');
      return null;
    }
    return { propertyId, tenancyId, year };
  }

  async function createPreview() {
    const body = requestBody();
    if (!body) return;
    setLoading(true);
    setError('');
    try {
      const calculated = correction
        ? await postJsonWithRevision<SettlementPreview>(
            `/api/settlements/${correction.snapshotId}/correction?propertyId=${body.propertyId}`,
            {},
            correction.revision,
          )
        : await postJson<SettlementPreview>('/api/settlements/preview', body);
      setPreview(calculated);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Abrechnung konnte nicht berechnet werden.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function closeSettlement() {
    if (!preview || preview.closed || !preview.canClose) return;
    if (!preview.calculationToken) {
      setError('Diese Vorschau ist veraltet. Bitte berechne sie vor dem Abschluss noch einmal.');
      return;
    }
    const body: SettlementCloseRequest = {
      propertyId: preview.propertyId,
      tenancyId: preview.tenancyId,
      year: preview.year,
      expectedCalculationToken: preview.calculationToken,
      ...(correction
        ? {
            correctionSnapshotId: correction.snapshotId,
            correctionRevision: correction.revision,
          }
        : {}),
    };
    if (
      !window.confirm(
        `Abrechnung ${preview.year} für ${preview.tenantName} verbindlich abschließen? Der berechnete Stand wird unveränderlich gespeichert.`,
      )
    ) {
      return;
    }

    setLoading(true);
    setError('');
    try {
      const closed = await postJson<SettlementPreview>('/api/settlements/close', body);
      setPreview(closed);
      setCorrection(null);
      if (propertyId) await refreshArchive(propertyId);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Abrechnung konnte nicht abgeschlossen werden.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function correctSettlement() {
    if (!preview?.closed || !preview.snapshotId) return;
    const archiveItem = archive.find((item) => item.snapshotId === preview.snapshotId);
    if (!archiveItem) {
      setError('Der Archivstand ist noch nicht geladen. Bitte versuche es gleich erneut.');
      return;
    }
    if (
      !window.confirm(
        `Abrechnung ${preview.year} für ${preview.tenantName} zur Korrektur öffnen?\n\nDie App berechnet eine neue Vorschau aus den aktuellen Kosten, Zahlungen und Vermieterdaten. Der bisherige Abschluss bleibt erhalten, bis du die Korrektur erneut abschließt. Vorher kannst du unter Einstellungen ein JSON-Backup herunterladen.`,
      )
    ) {
      return;
    }

    setLoading(true);
    setArchiveBusyId(preview.snapshotId);
    setError('');
    try {
      const corrected = await postJsonWithRevision<SettlementPreview>(
        `/api/settlements/${preview.snapshotId}/correction?propertyId=${preview.propertyId}`,
        {},
        archiveItem.revision,
      );
      setTenancyId(corrected.tenancyId);
      setPreview(corrected);
      setCorrection({ snapshotId: archiveItem.snapshotId, revision: archiveItem.revision });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Die Abrechnung konnte nicht zur Korrektur geöffnet werden.',
      );
    } finally {
      setLoading(false);
      setArchiveBusyId(null);
    }
  }

  function changeTenancy(nextTenancyId: number | null) {
    setTenancyId(nextTenancyId);
    setPreview(null);
    setCorrection(null);
    setError('');
  }

  return (
    <>
      <PageHeader
        title={`Abrechnung ${preview?.year ?? year}`}
        subtitle="Die Vorauszahlungen stammen aus dem tatsächlichen Mietkonto. Erst prüfen, dann den Stand unveränderlich abschließen."
        actions={
          preview ? (
            <SettlementActions
              preview={preview}
              busy={loading || archiveBusyId !== null}
              onPrint={() => window.print()}
              onCorrect={() => void correctSettlement()}
              onClose={() => void closeSettlement()}
            />
          ) : undefined
        }
      />

      {error && <ErrorBox message={error} />}
      <SettlementNotices
        pendingCostCount={pendingCostCount}
        preview={preview}
        isCorrection={correction !== null}
      />
      <SettlementControls
        eligibleTenancies={selectableTenancies}
        units={data.units}
        tenancyId={tenancyId}
        loading={loading || archiveBusyId !== null}
        hasPreview={preview !== null}
        onTenancyChange={changeTenancy}
        onCreatePreview={() => void createPreview()}
      />

      {propertyId && (
        <SettlementArchive
          items={archive}
          tenancies={data.tenancies}
          units={data.units}
          loading={archiveLoading}
          busySnapshotId={loading ? -1 : archiveBusyId}
          openSnapshotId={preview?.closed ? preview.snapshotId : null}
          error={archiveError}
          onOpen={(snapshotId) => void openSnapshot(snapshotId)}
        />
      )}

      {loading && <Loading label="Abrechnung wird centgenau berechnet …" />}
      {!loading && archiveBusyId !== null && !preview && (
        <Loading label="Gespeicherte Abrechnung wird geöffnet …" />
      )}
      {!loading && archiveBusyId === null && !preview && eligibleTenancies.length === 0 && (
        <EmptyState title="Kein Mietverhältnis im gewählten Jahr">
          Lege ein Mietverhältnis an oder wähle ein anderes Abrechnungsjahr.
        </EmptyState>
      )}
      {!loading && archiveBusyId === null && !preview && eligibleTenancies.length > 0 && (
        <EmptyState
          title="Vorschau noch nicht berechnet"
          action={
            <button
              className="btn btn-primary"
              type="button"
              disabled={!tenancyId}
              onClick={() => void createPreview()}
            >
              Jetzt berechnen
            </button>
          }
        >
          Prüfe anschließend Kostenpositionen, tatsächliche Vorauszahlungen und Saldo.
        </EmptyState>
      )}

      {!loading && preview && <SettlementPaper preview={preview} />}
    </>
  );
}
