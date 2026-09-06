import { useMemo, useState } from 'react';
import type { PageProps } from '../App';
import { deleteJson, postJson, putJson } from '../api';
import { ConfirmButton, EmptyState, ErrorBox, Notice, PageHeader } from '../components/Common';
import { activeInYear } from '../format';
import OperatingCostPlanModal from './operating-cost-plan/OperatingCostPlanModal';
import OperatingCostPlanPaper from './operating-cost-plan/OperatingCostPlanPaper';
import {
  createEmptyOperatingCostPlanForm,
  createOperatingCostPlanForm,
  parseOperatingCostPlanForm,
  type OperatingCostPlanForm,
} from './operating-cost-plan/model';

export default function OperatingCostPlanPage({ data, propertyId, year, reload }: PageProps) {
  const planYear = year + 1;
  const eligibleTenancies = useMemo(
    () =>
      data.tenancies.filter((tenancy) =>
        activeInYear(tenancy.startDate, tenancy.endDate, planYear),
      ),
    [data.tenancies, planYear],
  );
  const [tenancyId, setTenancyId] = useState<number | null>(eligibleTenancies[0]?.id ?? null);
  const [form, setForm] = useState<OperatingCostPlanForm | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedTenancy =
    eligibleTenancies.find((tenancy) => tenancy.id === tenancyId) ?? eligibleTenancies[0];
  const selectedUnit = data.units.find((unit) => unit.id === selectedTenancy?.unitId);
  const selectedProperty = data.properties.find((property) => property.id === propertyId);
  const plan = data.operatingCostPlans.find(
    (candidate) => candidate.tenancyId === selectedTenancy?.id && candidate.year === planYear,
  );
  const preview = form ? parseOperatingCostPlanForm(form) : null;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await reload();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Der Betriebskosten-Wirtschaftsplan konnte nicht gespeichert werden.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function savePlan() {
    if (!form || !propertyId || !selectedTenancy) return;
    const parsed = parseOperatingCostPlanForm(form);
    if (!parsed) {
      setError('Bitte alle Beträge mit höchstens zwei Nachkommastellen und die Monate prüfen.');
      return;
    }
    await run(async () => {
      const body = {
        propertyId,
        tenancyId: selectedTenancy.id,
        year: planYear,
        housingCosts: parsed.housingCosts,
        garageCosts: parsed.garageCosts,
        propertyTax: parsed.propertyTax,
        months: parsed.months,
        monthlyPrepayment: parsed.monthlyPrepayment,
        notes: parsed.notes,
        revision: form.revision,
      };
      if (form.id) await putJson(`/api/operating-cost-plans/${form.id}`, body);
      else await postJson('/api/operating-cost-plans', body);
      setForm(null);
    });
  }

  return (
    <>
      <PageHeader
        title={`Wirtschaftsplan ${planYear}`}
        subtitle={`Betriebskosten für das Folgejahr zur Abrechnung ${year} planen und eine monatliche Vorauszahlung festlegen.`}
        actions={
          plan ? (
            <>
              <button className="btn btn-secondary" type="button" onClick={() => window.print()}>
                Drucken
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setForm(createOperatingCostPlanForm(plan))}
              >
                Bearbeiten
              </button>
            </>
          ) : undefined
        }
      />

      {error && <ErrorBox message={error} />}
      {!propertyId && <Notice kind="warning">Bitte zuerst ein Haus anlegen oder auswählen.</Notice>}
      {propertyId && eligibleTenancies.length === 0 && (
        <Notice kind="warning">
          Im Planjahr {planYear} gibt es kein aktives Mietverhältnis. Prüfe zuerst die Stammdaten.
        </Notice>
      )}

      {eligibleTenancies.length > 0 && (
        <section className="card plan-controls no-print">
          <label className="field">
            Wirtschaftsplan für
            <select
              value={selectedTenancy?.id ?? ''}
              onChange={(event) => {
                setTenancyId(Number(event.target.value));
                setForm(null);
                setError('');
              }}
            >
              {eligibleTenancies.map((tenancy) => {
                const unit = data.units.find((candidate) => candidate.id === tenancy.unitId);
                return (
                  <option key={tenancy.id} value={tenancy.id}>
                    {unit?.name ?? 'Wohnung'} · {tenancy.tenantName}
                  </option>
                );
              })}
            </select>
          </label>
          <small>Das Planjahr ist immer das Folgejahr zum oben gewählten Abrechnungsjahr.</small>
        </section>
      )}

      {plan && (
        <>
          <OperatingCostPlanPaper
            plan={plan}
            property={selectedProperty}
            tenancy={selectedTenancy}
            unit={selectedUnit}
          />
          <div className="plan-delete no-print">
            <ConfirmButton
              question={`Wirtschaftsplan ${planYear} wirklich löschen?`}
              onConfirm={() =>
                run(async () => {
                  await deleteJson(`/api/operating-cost-plans/${plan.id}`, plan.revision);
                })
              }
            >
              Wirtschaftsplan löschen
            </ConfirmButton>
          </div>
        </>
      )}

      {!plan && selectedTenancy && (
        <section className="card">
          <EmptyState
            title={`Noch kein Wirtschaftsplan für ${planYear}`}
            action={
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setForm(createEmptyOperatingCostPlanForm(selectedTenancy))}
              >
                Wirtschaftsplan anlegen
              </button>
            }
          >
            Erfasse die Jahreswerte für Wohnung, Garage und Grundsteuer aus dem Wirtschaftsplan.
          </EmptyState>
        </section>
      )}

      {form && (
        <OperatingCostPlanModal
          form={form}
          year={planYear}
          preview={preview}
          error={error}
          busy={busy}
          onChange={setForm}
          onSave={savePlan}
          onClose={() => {
            setForm(null);
            setError('');
          }}
        />
      )}
    </>
  );
}
