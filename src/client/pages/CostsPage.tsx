import { useMemo, useState } from 'react';
import { STATEMENT_GROUPS } from '../../shared/constants';
import type { PageProps } from '../App';
import { deleteJson, postJson, putJson } from '../api';
import { ErrorBox, Notice, PageHeader } from '../components/Common';
import { activeInYear, parseGermanNumber } from '../format';
import { CostFormModal } from './costs/CostFormModal';
import { CostList } from './costs/CostList';
import { CostMetrics } from './costs/CostMetrics';
import {
  createCostFormForEditing,
  createEmptyCostForm,
  type CostForm,
  type CostView,
} from './costs/cost-model';

export default function CostsPage({ data, propertyId, year, reload }: PageProps) {
  const [view, setView] = useState<CostView>('internal');
  const [form, setForm] = useState<CostForm | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const yearCosts = useMemo(
    () => data.costs.filter((cost) => cost.year === year),
    [data.costs, year],
  );
  const statementGroups = useMemo(
    () => [
      ...new Set<string>([
        ...STATEMENT_GROUPS,
        ...yearCosts.map((cost) => cost.statementGroup).filter(Boolean),
      ]),
    ],
    [yearCosts],
  );
  const yearTenancies = useMemo(
    () =>
      data.tenancies.filter((tenancy) => activeInYear(tenancy.startDate, tenancy.endDate, year)),
    [data.tenancies, year],
  );

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
          : 'Die Kostenposition konnte nicht gespeichert werden.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveCost() {
    if (!form || !propertyId) return;

    const sourceAmount = parseGermanNumber(form.sourceAmount);
    const enteredAllocable = parseGermanNumber(form.allocableAmount);
    const labor35a = parseGermanNumber(form.labor35a);
    const allocableAmount = form.tenantStatus === 'excluded' ? 0 : enteredAllocable;

    if (!form.descriptionInternal.trim() || sourceAmount === null || sourceAmount < 0) {
      return setError('Bitte interne Bezeichnung und Originalbetrag prüfen.');
    }
    if (!form.statementGroup.trim() || form.statementGroup.trim().length > 100) {
      return setError('Bitte eine Sammelposition mit höchstens 100 Zeichen angeben.');
    }
    if (allocableAmount === null || allocableAmount < 0 || allocableAmount > sourceAmount) {
      return setError('Der umlagefähige Betrag muss zwischen 0 und Originalbetrag liegen.');
    }
    if (labor35a === null || labor35a < 0 || labor35a > allocableAmount) {
      return setError('Der §35a-Anteil darf den umlagefähigen Betrag nicht überschreiten.');
    }
    if (form.allocationKey === 'direct' && !form.directUnitId && !form.directTenancyId) {
      return setError('Für die Direktzuordnung bitte Wohnung oder Mietverhältnis wählen.');
    }
    if (form.allocationMode === 'fixedTenancy' && !form.directTenancyId) {
      return setError('Ein fester Mieteranteil braucht ein Mietverhältnis.');
    }
    if (form.allocationKey === 'meter' && !form.meterType) {
      return setError('Bitte die Zählerart wählen.');
    }

    await run(async () => {
      const body = {
        propertyId,
        year,
        descriptionInternal: form.descriptionInternal.trim(),
        descriptionTenant: form.descriptionTenant.trim(),
        sourceAmount,
        tenantStatus: form.tenantStatus,
        allocableAmount,
        statementGroup: form.statementGroup.trim(),
        allocationMode: form.allocationMode,
        allocationKey: form.allocationKey,
        directUnitId:
          form.allocationMode === 'standard' && form.allocationKey === 'direct' && form.directUnitId
            ? Number(form.directUnitId)
            : null,
        directTenancyId:
          (form.allocationMode === 'fixedTenancy' || form.allocationKey === 'direct') &&
          form.directTenancyId
            ? Number(form.directTenancyId)
            : null,
        meterType:
          form.allocationMode === 'standard' && form.allocationKey === 'meter'
            ? form.meterType || null
            : null,
        labor35a,
        notes: form.notes.trim(),
        revision: form.revision,
      };

      if (form.id) await putJson(`/api/costs/${form.id}`, body);
      else await postJson('/api/costs', body);
      setForm(null);
    });
  }

  return (
    <>
      <PageHeader
        title={`Kosten ${year}`}
        subtitle="Einzelkosten intern dokumentieren, Umlagefähigkeit entscheiden und für den Mieter zu übersichtlichen Sammelpositionen bündeln."
        actions={
          <button
            className="btn btn-primary"
            disabled={!propertyId}
            onClick={() => setForm(createEmptyCostForm())}
          >
            + Kostenposition
          </button>
        }
      />
      {error && <ErrorBox message={error} />}
      {!propertyId && <Notice kind="warning">Bitte zuerst ein Haus anlegen oder auswählen.</Notice>}

      <CostMetrics costs={yearCosts} />
      <CostList
        view={view}
        costs={yearCosts}
        units={data.units}
        tenancies={data.tenancies}
        onViewChange={setView}
        onCreate={() => setForm(createEmptyCostForm())}
        onEdit={(cost) => setForm(createCostFormForEditing(cost))}
        onDelete={(cost) =>
          run(async () => {
            await deleteJson(`/api/costs/${cost.id}`, cost.revision);
          })
        }
      />

      {form && (
        <CostFormModal
          form={form}
          statementGroups={statementGroups}
          units={data.units}
          tenancies={yearTenancies}
          error={error}
          busy={busy}
          onChange={setForm}
          onSave={saveCost}
          onClose={() => setForm(null)}
        />
      )}
    </>
  );
}
