import { useMemo, useState } from 'react';
import type { PageProps } from '../App';
import { deleteJson, postJson, putJson } from '../api';
import { EmptyState, ErrorBox, Notice, PageHeader } from '../components/Common';
import { parseGermanNumber } from '../format';
import type { Property, Tenancy, Unit } from '../types';
import ChangeoverModal, { type ChangeoverPayload } from './properties/ChangeoverModal';
import {
  createEmptyPropertyForm,
  createEmptyTenancyForm,
  createEmptyUnitForm,
  propertyToForm,
  tenancyToForm,
  unitToForm,
  type PropertyForm,
  type TenancyForm,
  type UnitForm,
} from './properties/formModels';
import PropertyFormModal from './properties/PropertyFormModal';
import PropertyStrip from './properties/PropertyStrip';
import TenancyFormModal from './properties/TenancyFormModal';
import UnitFormModal from './properties/UnitFormModal';
import UnitsSection from './properties/UnitsSection';

export default function PropertiesPage({ data, allData, propertyId, year, reload }: PageProps) {
  const [propertyForm, setPropertyForm] = useState<PropertyForm | null>(null);
  const [unitForm, setUnitForm] = useState<UnitForm | null>(null);
  const [tenancyForm, setTenancyForm] = useState<TenancyForm | null>(null);
  const [changeoverTenancy, setChangeoverTenancy] = useState<Tenancy | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const property = allData.properties.find((item) => item.id === propertyId) ?? null;
  const units = data.units;
  const tenanciesByUnit = useMemo(() => {
    const result = new Map<number, Tenancy[]>();
    for (const tenancy of data.tenancies) {
      const unitTenancies = result.get(tenancy.unitId) ?? [];
      unitTenancies.push(tenancy);
      result.set(
        tenancy.unitId,
        unitTenancies.sort((left, right) => right.startDate.localeCompare(left.startDate)),
      );
    }
    return result;
  }, [data.tenancies]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  async function saveProperty() {
    if (!propertyForm?.name.trim()) {
      setError('Bitte eine Bezeichnung für das Haus eintragen.');
      return;
    }

    await run(async () => {
      const paymentDeadlineDays = propertyForm.paymentDeadlineDays
        ? Number(propertyForm.paymentDeadlineDays)
        : null;
      if (
        paymentDeadlineDays !== null &&
        (!Number.isInteger(paymentDeadlineDays) ||
          paymentDeadlineDays < 1 ||
          paymentDeadlineDays > 365)
      ) {
        throw new Error('Die Zahlungsfrist muss zwischen 1 und 365 Tagen liegen.');
      }

      const body = {
        name: propertyForm.name.trim(),
        address: propertyForm.address.trim(),
        landlordName: propertyForm.landlordName.trim() || null,
        landlordAddress: propertyForm.landlordAddress.trim() || null,
        bankAccountHolder: propertyForm.bankAccountHolder.trim() || null,
        bankIban: propertyForm.bankIban.trim().toUpperCase() || null,
        paymentDeadlineDays,
        revision: propertyForm.revision,
      };

      if (propertyForm.id) await putJson(`/api/properties/${propertyForm.id}`, body);
      else await postJson('/api/properties', body);
      setPropertyForm(null);
    });
  }

  async function saveUnit() {
    if (!unitForm || !propertyId) return;

    const areaSqm = parseGermanNumber(unitForm.areaSqm);
    const unitWeight = parseGermanNumber(unitForm.unitWeight);
    if (!unitForm.name.trim() || !areaSqm || areaSqm <= 0) {
      setError('Wohnungsname und eine positive Fläche sind erforderlich.');
      return;
    }
    if (!unitWeight || unitWeight <= 0) {
      setError('Das Einheitengewicht muss größer als null sein.');
      return;
    }

    await run(async () => {
      const body = {
        propertyId,
        name: unitForm.name.trim(),
        floor: unitForm.floor.trim(),
        areaSqm,
        unitWeight,
        notes: unitForm.notes.trim(),
        revision: unitForm.revision,
      };

      if (unitForm.id) await putJson(`/api/units/${unitForm.id}`, body);
      else await postJson('/api/units', body);
      setUnitForm(null);
    });
  }

  async function saveTenancy() {
    if (!tenancyForm) return;

    const persons = parseGermanNumber(tenancyForm.persons);
    const baseRent = parseGermanNumber(tenancyForm.baseRent);
    const utilityPrepayment = parseGermanNumber(tenancyForm.utilityPrepayment);
    const garagePrepayment = parseGermanNumber(tenancyForm.garagePrepayment);
    const paymentDay = Number(tenancyForm.paymentDay);

    if (!tenancyForm.tenantName.trim() || !tenancyForm.startDate) {
      setError('Name und Mietbeginn sind erforderlich.');
      return;
    }
    if (tenancyForm.endDate && tenancyForm.endDate < tenancyForm.startDate) {
      setError('Das Mietende darf nicht vor dem Beginn liegen.');
      return;
    }
    if (
      !persons ||
      persons <= 0 ||
      baseRent === null ||
      utilityPrepayment === null ||
      garagePrepayment === null
    ) {
      setError('Bitte Personen und Geldbeträge prüfen.');
      return;
    }
    if (!Number.isInteger(paymentDay) || paymentDay < 1 || paymentDay > 31) {
      setError('Der Zahlungstag muss zwischen 1 und 31 liegen.');
      return;
    }

    await run(async () => {
      const body = {
        unitId: tenancyForm.unitId,
        tenantName: tenancyForm.tenantName.trim(),
        tenantAddress: tenancyForm.tenantAddress.trim(),
        startDate: tenancyForm.startDate,
        endDate: tenancyForm.endDate || null,
        persons,
        baseRent,
        utilityPrepayment,
        garagePrepayment,
        paymentDay,
        notes: tenancyForm.notes.trim(),
        revision: tenancyForm.revision,
      };

      if (tenancyForm.id) await putJson(`/api/tenancies/${tenancyForm.id}`, body);
      else await postJson('/api/tenancies', body);
      setTenancyForm(null);
    });
  }

  async function saveChangeover(payload: ChangeoverPayload) {
    await run(async () => {
      const result = await postJson<{ deletedFuturePayments: number }>('/api/changeovers', payload);
      setChangeoverTenancy(null);
      setNotice(
        result.deletedFuturePayments > 0
          ? `Mieterwechsel gespeichert. ${result.deletedFuturePayments} unbezahlte Folgemonate des bisherigen Mieters wurden entfernt.`
          : 'Mieterwechsel gespeichert.',
      );
    });
  }

  function deleteProperty(selectedProperty: Property) {
    return run(async () => {
      await deleteJson(`/api/properties/${selectedProperty.id}`, selectedProperty.revision);
    });
  }

  function deleteUnit(selectedUnit: Unit) {
    return run(async () => {
      await deleteJson(`/api/units/${selectedUnit.id}`, selectedUnit.revision);
    });
  }

  function deleteTenancy(selectedTenancy: Tenancy) {
    return run(async () => {
      await deleteJson(`/api/tenancies/${selectedTenancy.id}`, selectedTenancy.revision);
    });
  }

  return (
    <>
      <PageHeader
        title="Häuser & Wohnungen"
        subtitle="Jedes Haus bildet einen eigenen Abrechnungskreis. Mietverhältnisse gehören immer zu genau einer Wohnung."
        actions={
          <button
            className="btn btn-primary"
            onClick={() => setPropertyForm(createEmptyPropertyForm())}
          >
            + Haus anlegen
          </button>
        }
      />
      {error && <ErrorBox message={error} />}
      {notice && <Notice kind="success">{notice}</Notice>}

      <PropertyStrip
        properties={allData.properties}
        units={allData.units}
        selectedPropertyId={propertyId}
        onEdit={(selectedProperty) => setPropertyForm(propertyToForm(selectedProperty))}
        onDelete={deleteProperty}
      />

      {!property && (
        <EmptyState
          title="Noch kein Haus ausgewählt"
          action={
            <button
              className="btn btn-primary"
              onClick={() => setPropertyForm(createEmptyPropertyForm())}
            >
              Haus anlegen
            </button>
          }
        >
          Beginne mit Name und Anschrift des Gebäudes.
        </EmptyState>
      )}

      {property && (
        <UnitsSection
          property={property}
          units={units}
          tenanciesByUnit={tenanciesByUnit}
          onAddUnit={() => setUnitForm(createEmptyUnitForm())}
          onEditUnit={(selectedUnit) => setUnitForm(unitToForm(selectedUnit))}
          onDeleteUnit={deleteUnit}
          onAddTenancy={(selectedUnit) =>
            setTenancyForm(createEmptyTenancyForm(selectedUnit.id, year))
          }
          onEditTenancy={(selectedTenancy) => setTenancyForm(tenancyToForm(selectedTenancy))}
          onDeleteTenancy={deleteTenancy}
          onChangeover={setChangeoverTenancy}
        />
      )}

      {propertyForm && (
        <PropertyFormModal
          form={propertyForm}
          error={error}
          busy={busy}
          onChange={setPropertyForm}
          onSave={saveProperty}
          onClose={() => setPropertyForm(null)}
        />
      )}

      {unitForm && (
        <UnitFormModal
          form={unitForm}
          error={error}
          busy={busy}
          onChange={setUnitForm}
          onSave={saveUnit}
          onClose={() => setUnitForm(null)}
        />
      )}

      {tenancyForm && (
        <TenancyFormModal
          form={tenancyForm}
          error={error}
          busy={busy}
          onChange={setTenancyForm}
          onSave={saveTenancy}
          onClose={() => setTenancyForm(null)}
        />
      )}

      {changeoverTenancy && (
        <ChangeoverModal
          tenancy={changeoverTenancy}
          unit={units.find((unit) => unit.id === changeoverTenancy.unitId)}
          meters={data.meters.filter((meter) => meter.unitId === changeoverTenancy.unitId)}
          year={year}
          busy={busy}
          error={error}
          onClose={() => setChangeoverTenancy(null)}
          onDone={saveChangeover}
        />
      )}
    </>
  );
}
