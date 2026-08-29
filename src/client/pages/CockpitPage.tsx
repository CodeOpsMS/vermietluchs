import { useEffect, useState } from 'react';
import type { PageProps } from '../App';
import { getJson } from '../api';
import { EmptyState, PageHeader, StatusPill } from '../components/Common';
import { activeInYear, euro } from '../format';
import type { SettlementArchiveItem } from './settlement/types';

type PageId = 'properties' | 'costs' | 'meters' | 'rent' | 'settlement';

export default function CockpitPage({
  data,
  propertyId,
  year,
  onNavigate,
}: PageProps & { onNavigate: (page: PageId) => void }) {
  const [settlements, setSettlements] = useState<SettlementArchiveItem[]>([]);
  const [settlementStatus, setSettlementStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (!propertyId) {
        if (!cancelled) {
          setSettlements([]);
          setSettlementStatus('ready');
        }
        return;
      }

      if (!cancelled) {
        setSettlements([]);
        setSettlementStatus('loading');
      }
      try {
        const result = await getJson<SettlementArchiveItem[]>(
          `/api/settlements?propertyId=${propertyId}&year=${year}`,
        );
        if (!cancelled) {
          setSettlements(result);
          setSettlementStatus('ready');
        }
      } catch {
        if (!cancelled) setSettlementStatus('error');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [propertyId, year]);

  if (!propertyId) {
    return (
      <>
        <PageHeader
          title="Willkommen"
          subtitle="Lege zuerst dein erstes Haus an. Danach führt dich das Cockpit durch den Rest."
        />
        <EmptyState
          title="Noch kein Haus angelegt"
          action={
            <button className="btn btn-primary" onClick={() => onNavigate('properties')}>
              Erstes Haus anlegen
            </button>
          }
        >
          Häuser trennen Kosten, Wohnungen, Zähler und Abrechnungen sauber voneinander.
        </EmptyState>
      </>
    );
  }

  const activeTenancies = data.tenancies.filter((tenancy) =>
    activeInYear(tenancy.startDate, tenancy.endDate, year),
  );
  const closedTenancyIds = new Set(settlements.map((settlement) => settlement.tenancyId));
  const closedSettlementCount = activeTenancies.filter((tenancy) =>
    closedTenancyIds.has(tenancy.id),
  ).length;
  const allSettlementsClosed =
    activeTenancies.length > 0 && closedSettlementCount === activeTenancies.length;
  const yearCosts = data.costs.filter((cost) => cost.year === year);
  const included = yearCosts.filter((cost) => cost.tenantStatus === 'included');
  const pending = yearCosts.filter((cost) => cost.tenantStatus === 'pending');
  const externalTotal = included.reduce((sum, cost) => sum + cost.allocableAmount, 0);
  const internalTotal = yearCosts.reduce((sum, cost) => sum + cost.sourceAmount, 0);
  const yearPayments = data.payments.filter((payment) => payment.dueDate.startsWith(String(year)));
  const due = yearPayments.reduce(
    (sum, payment) => sum + payment.baseRentDue + payment.utilityDue + payment.garageDue,
    0,
  );
  const paid = yearPayments.reduce((sum, payment) => sum + payment.amountPaid, 0);
  const accountBalance = Math.round((due - paid) * 100) / 100;
  const accountStatus =
    accountBalance > 0
      ? `${euro(accountBalance)} offen`
      : accountBalance < 0
        ? `${euro(accountBalance)} Überzahlung / Guthaben`
        : 'Konto ausgeglichen';
  const readingsThisYear = data.readings.filter((reading) =>
    reading.date.startsWith(String(year)),
  ).length;

  const tasks = [
    {
      label: 'Kosten prüfen',
      detail: pending.length
        ? `${pending.length} Position${pending.length === 1 ? '' : 'en'} noch offen`
        : 'Alle Kosten entschieden',
      done: pending.length === 0,
      page: 'costs' as PageId,
    },
    {
      label: 'Zählerstände',
      detail: readingsThisYear
        ? `${readingsThisYear} Ablesungen erfasst`
        : `Noch keine Ablesung für ${year}`,
      done: readingsThisYear > 0,
      page: 'meters' as PageId,
    },
    {
      label: 'Mietkonto',
      detail: due || paid ? accountStatus : 'Noch kein Jahressoll erzeugt',
      done: due > 0 && accountBalance <= 0,
      page: 'rent' as PageId,
    },
    {
      label: 'Abrechnung',
      detail:
        settlementStatus === 'loading'
          ? 'Abschlussstatus wird geladen'
          : settlementStatus === 'error'
            ? 'Abschlussstatus nicht verfügbar'
            : allSettlementsClosed
              ? `${closedSettlementCount} Abrechnung${closedSettlementCount === 1 ? '' : 'en'} abgeschlossen`
              : closedSettlementCount > 0
                ? `${closedSettlementCount} von ${activeTenancies.length} Abrechnungen abgeschlossen`
                : pending.length
                  ? 'Nach Kostenprüfung möglich'
                  : activeTenancies.length === 0
                    ? 'Kein Mietverhältnis im gewählten Jahr'
                    : 'Vorschau ist bereit',
      done: allSettlementsClosed,
      page: 'settlement' as PageId,
    },
  ];

  return (
    <>
      <PageHeader
        title={`Cockpit ${year}`}
        subtitle="Was erledigt ist, was noch fehlt und welche Zahlen gerade zählen."
      />

      <section className="metrics-grid">
        <article className="metric metric-primary">
          <span>Umlagefähig extern</span>
          <strong>{euro(externalTotal)}</strong>
          <small>für Mieter freigegeben</small>
        </article>
        <article className="metric">
          <span>Kosten intern</span>
          <strong>{euro(internalTotal)}</strong>
          <small>vollständiger Eigentümerblick</small>
        </article>
        <article className="metric">
          <span>Mietverhältnisse</span>
          <strong>{activeTenancies.length}</strong>
          <small>im gewählten Jahr aktiv</small>
        </article>
        <article className="metric">
          <span>Kontosaldo (Soll − Ist)</span>
          <strong>{euro(accountBalance)}</strong>
          <small>
            {accountBalance > 0
              ? 'offener Betrag'
              : accountBalance < 0
                ? 'Überzahlung / Guthaben'
                : 'Konto ausgeglichen'}{' '}
            · {yearPayments.length} Monatsbuchungen
          </small>
        </article>
      </section>

      <div className="dashboard-grid">
        <section className="card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Jahreslauf</p>
              <h2>Nächste Schritte</h2>
            </div>
            <StatusPill tone={pending.length ? 'warn' : 'good'}>
              {pending.length ? `${pending.length} offen` : 'auf Kurs'}
            </StatusPill>
          </div>
          <div className="task-list">
            {tasks.map((task, index) => (
              <button key={task.label} type="button" onClick={() => onNavigate(task.page)}>
                <span className={`task-index ${task.done ? 'done' : ''}`}>
                  {task.done ? '✓' : index + 1}
                </span>
                <span>
                  <strong>{task.label}</strong>
                  <small>{task.detail}</small>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        </section>

        <section className="card warm-card">
          <p className="eyebrow">Interne und externe Sicht</p>
          <h2>Eine Wahrheit, zwei Ansichten</h2>
          <p>
            Intern bleiben Originalkosten und Prüffälle sichtbar. In der Mieterabrechnung erscheinen
            nur freigegebene, umlagefähige Beträge – gebündelt nach Sammelposition.
          </p>
          <div className="comparison-bars">
            <div>
              <span>
                <b>Intern</b>
                {euro(internalTotal)}
              </span>
              <i style={{ width: '100%' }} />
            </div>
            <div>
              <span>
                <b>Extern</b>
                {euro(externalTotal)}
              </span>
              <i
                style={{
                  width: internalTotal
                    ? `${Math.min(100, (externalTotal / internalTotal) * 100)}%`
                    : '0%',
                }}
              />
            </div>
          </div>
          <button className="text-button" type="button" onClick={() => onNavigate('costs')}>
            Kosten prüfen →
          </button>
        </section>
      </div>
    </>
  );
}
