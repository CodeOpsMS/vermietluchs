import { useEffect, useMemo, useState } from 'react';
import { STATEMENT_GROUPS } from '../../shared/constants';
import type { PageProps } from '../App';
import { getJson, postJson } from '../api';
import { EmptyState, ErrorBox, Loading, PageHeader } from '../components/Common';
import { activeInYear, parseGermanNumber } from '../format';
import type { SettlementPreview } from '../types';
import SettlementArchive from './settlement/SettlementArchive';
import SettlementControls from './settlement/SettlementControls';
import SettlementNotices from './settlement/SettlementNotices';
import SettlementPaper from './settlement/SettlementPaper';
import type { SettlementArchiveItem, SettlementRequest } from './settlement/types';

export default function SettlementPage({ data, propertyId, year }: PageProps) {
  const eligibleTenancies = useMemo(
    () =>
      data.tenancies.filter((tenancy) => activeInYear(tenancy.startDate, tenancy.endDate, year)),
    [data.tenancies, year],
  );
  const eligibleKey = eligibleTenancies.map((tenancy) => tenancy.id).join(',');
  const firstEligibleId = eligibleTenancies[0]?.id ?? null;

  const [tenancyId, setTenancyId] = useState<number | null>(firstEligibleId);
  const [roundingText, setRoundingText] = useState('0,00');
  const [roundingGroup, setRoundingGroup] = useState<string>(STATEMENT_GROUPS[0]);
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [archive, setArchive] = useState<SettlementArchiveItem[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveBusyId, setArchiveBusyId] = useState<number | null>(null);
  const [archiveError, setArchiveError] = useState('');

  const pendingCostCount = data.costs.filter(
    (cost) => cost.year === year && cost.tenantStatus === 'pending',
  ).length;
  const availableGroups = useMemo(
    () => [
      ...new Set<string>([
        ...STATEMENT_GROUPS,
        ...data.costs
          .filter((cost) => cost.year === year)
          .map((cost) => cost.statementGroup)
          .filter(Boolean),
      ]),
    ],
    [data.costs, year],
  );

  useEffect(() => {
    // Nach einem Haus-, Jahres- oder Mietvertragswechsel darf keine alte Auswahl weiterleben.
    void Promise.resolve().then(() => {
      const eligibleIds = new Set(eligibleKey.split(',').filter(Boolean).map(Number));
      setTenancyId((current) =>
        current !== null && eligibleIds.has(current) ? current : firstEligibleId,
      );
      setPreview(null);
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
      setPreview(snapshot);
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
    const roundingDifference = parseGermanNumber(roundingText);
    const cleanGroup = roundingGroup.trim();
    if (!propertyId || !tenancyId) {
      setError('Bitte zuerst Haus und Mietverhältnis auswählen.');
      return null;
    }
    if (roundingDifference === null || roundingDifference < -10 || roundingDifference > 10) {
      setError(
        'Die Rundungsdifferenz muss als Eurobetrag zwischen −10,00 € und 10,00 € angegeben werden.',
      );
      return null;
    }
    if (!cleanGroup || cleanGroup.length > 100) {
      setError('Bitte eine Rundungsgruppe mit höchstens 100 Zeichen angeben.');
      return null;
    }
    return { propertyId, tenancyId, year, roundingDifference, roundingGroup: cleanGroup };
  }

  async function createPreview() {
    const body = requestBody();
    if (!body) return;
    setLoading(true);
    setError('');
    try {
      setPreview(await postJson<SettlementPreview>('/api/settlements/preview', body));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Abrechnung konnte nicht berechnet werden.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function closeSettlement() {
    const body = requestBody();
    if (!body || !preview || preview.closed || !preview.canClose) return;
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
      if (propertyId) await refreshArchive(propertyId);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Abrechnung konnte nicht abgeschlossen werden.',
      );
    } finally {
      setLoading(false);
    }
  }

  function changeTenancy(nextTenancyId: number | null) {
    setTenancyId(nextTenancyId);
    setPreview(null);
    setError('');
  }

  function changeRoundingText(value: string) {
    setRoundingText(value);
    setPreview(null);
  }

  function changeRoundingGroup(value: string) {
    setRoundingGroup(value);
    setPreview(null);
  }

  return (
    <>
      <PageHeader
        title={`Abrechnung ${preview?.closed ? preview.year : year}`}
        subtitle="Die Vorauszahlungen stammen aus dem tatsächlichen Mietkonto. Erst prüfen, dann den Stand unveränderlich abschließen."
        actions={
          preview ? (
            <>
              <button className="btn btn-secondary" type="button" onClick={() => window.print()}>
                Drucken / PDF
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={preview.closed || !preview.canClose || loading}
                onClick={() => void closeSettlement()}
              >
                {preview.closed ? 'Abgeschlossen' : 'Abrechnung abschließen'}
              </button>
            </>
          ) : undefined
        }
      />

      {error && <ErrorBox message={error} />}
      <SettlementNotices pendingCostCount={pendingCostCount} preview={preview} />
      <SettlementControls
        eligibleTenancies={eligibleTenancies}
        units={data.units}
        tenancyId={tenancyId}
        roundingText={roundingText}
        roundingGroup={roundingGroup}
        availableGroups={availableGroups}
        loading={loading}
        hasPreview={preview !== null}
        onTenancyChange={changeTenancy}
        onRoundingTextChange={changeRoundingText}
        onRoundingGroupChange={changeRoundingGroup}
        onCreatePreview={() => void createPreview()}
      />

      {propertyId && (
        <SettlementArchive
          items={archive}
          tenancies={data.tenancies}
          units={data.units}
          loading={archiveLoading}
          busySnapshotId={archiveBusyId}
          openSnapshotId={preview?.closed ? preview.snapshotId : null}
          error={archiveError}
          onOpen={(snapshotId) => void openSnapshot(snapshotId)}
        />
      )}

      {loading && <Loading label="Abrechnung wird centgenau berechnet …" />}
      {!loading && !preview && eligibleTenancies.length === 0 && (
        <EmptyState title="Kein Mietverhältnis im gewählten Jahr">
          Lege ein Mietverhältnis an oder wähle ein anderes Abrechnungsjahr.
        </EmptyState>
      )}
      {!loading && !preview && eligibleTenancies.length > 0 && (
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
          Prüfe anschließend Kostenpositionen, tatsächliche Vorauszahlungen, Rundungsdifferenz und
          Saldo.
        </EmptyState>
      )}

      {!loading && preview && <SettlementPaper preview={preview} />}
    </>
  );
}
