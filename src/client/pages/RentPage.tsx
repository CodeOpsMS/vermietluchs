import { useMemo, useState } from 'react';
import type { PageProps } from '../App';
import { deleteJson, postJson, putJson } from '../api';
import { ErrorBox, Notice, PageHeader } from '../components/Common';
import { activeInYear, euro, parseGermanNumber } from '../format';
import type { Payment } from '../types';
import PaymentModal from './rent/PaymentModal';
import PaymentTable from './rent/PaymentTable';
import RentMetrics from './rent/RentMetrics';
import {
  createEmptyPayment,
  createPaymentForm,
  getPaidParts,
  paidTotal,
  parsePaidParts,
} from './rent/paymentModel';
import type { PaymentForm } from './rent/paymentModel';

export default function RentPage({ data, propertyId, year, reload }: PageProps) {
  const [form, setForm] = useState<PaymentForm | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);

  const activeTenancies = data.tenancies.filter((tenancy) =>
    activeInYear(tenancy.startDate, tenancy.endDate, year),
  );
  const yearPayments = useMemo(
    () =>
      data.payments
        .filter((payment) => payment.dueDate.startsWith(String(year)))
        .sort((left, right) => left.dueDate.localeCompare(right.dueDate)),
    [data.payments, year],
  );
  const totalDue = yearPayments.reduce(
    (sum, payment) => sum + payment.baseRentDue + payment.utilityDue + payment.garageDue,
    0,
  );
  const totalPaid = yearPayments.reduce((sum, payment) => sum + payment.amountPaid, 0);
  const totalUtilityPaid = yearPayments.reduce((sum, payment) => {
    const parts = getPaidParts(payment);
    return sum + parts.utilityPaid + parts.garagePaid;
  }, 0);
  const accountBalance = Math.round((totalDue - totalPaid) * 100) / 100;
  const formParts = form ? parsePaidParts(form) : null;
  const formTotal = formParts ? paidTotal(formParts) : null;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await reload();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Mietkonto konnte nicht aktualisiert werden.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function savePayment() {
    if (!form) return;
    const baseRentDue = parseGermanNumber(form.baseRentDue);
    const utilityDue = parseGermanNumber(form.utilityDue);
    const garageDue = parseGermanNumber(form.garageDue);
    const parts = parsePaidParts(form);
    if (
      !form.tenancyId ||
      !form.dueDate ||
      baseRentDue === null ||
      utilityDue === null ||
      garageDue === null ||
      !parts
    ) {
      setError('Bitte Mietverhältnis, Datum und alle Soll- und Istbeträge prüfen.');
      return;
    }
    if ([baseRentDue, utilityDue, garageDue].some((value) => value < 0)) {
      setError('Beträge dürfen nicht negativ sein.');
      return;
    }

    const amountPaid = paidTotal(parts);
    if (amountPaid > 0 && !form.paidDate) {
      setError('Bitte für einen Zahlungseingang ein Eingangsdatum angeben.');
      return;
    }
    if (amountPaid === 0 && form.paidDate) setForm({ ...form, paidDate: '' });

    const overpaidComponents = [
      parts.baseRentPaid > baseRentDue
        ? `Kaltmiete (${euro(parts.baseRentPaid)} bei ${euro(baseRentDue)} Soll)`
        : '',
      parts.utilityPaid > utilityDue
        ? `Nebenkosten (${euro(parts.utilityPaid)} bei ${euro(utilityDue)} Soll)`
        : '',
      parts.garagePaid > garageDue
        ? `Garage (${euro(parts.garagePaid)} bei ${euro(garageDue)} Soll)`
        : '',
    ].filter(Boolean);
    if (
      overpaidComponents.length > 0 &&
      !window.confirm(
        `Folgende Istbeträge liegen über dem jeweiligen Soll:\n\n${overpaidComponents.join('\n')}\n\nTrotzdem speichern?`,
      )
    ) {
      return;
    }

    await run(async () => {
      const body = {
        tenancyId: Number(form.tenancyId),
        dueDate: form.dueDate,
        paidDate: amountPaid > 0 ? form.paidDate : null,
        baseRentDue,
        utilityDue,
        garageDue,
        baseRentPaid: parts.baseRentPaid,
        utilityPaid: parts.utilityPaid,
        garagePaid: parts.garagePaid,
        amountPaid,
        note: form.note.trim(),
        revision: form.revision,
      };
      if (form.id) await putJson(`/api/payments/${form.id}`, body);
      else await postJson('/api/payments', body);
      setForm(null);
    });
  }

  async function generateYear() {
    if (!propertyId) return;
    if (
      !window.confirm(
        `Monats-Sollstellungen für ${year} aus allen Mietverträgen dieses Hauses erzeugen? Bereits vorhandene Monate bleiben unverändert.\n\nAutomatisch erzeugte Teilmonate übernehmen zunächst bewusst den vollen vertraglichen Monatsbetrag und müssen bei Bedarf manuell angepasst werden.`,
      )
    ) {
      return;
    }

    setGenerating(true);
    setError('');
    setNotice('');
    try {
      const result = await postJson<{ created: number }>('/api/payments/generate-year', {
        propertyId,
        year,
      });
      setNotice(
        result.created > 0
          ? `${result.created} Monatsbuchung${result.created === 1 ? '' : 'en'} wurden erzeugt.`
          : 'Alle Monatsbuchungen waren bereits vorhanden.',
      );
      await reload();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Jahressoll konnte nicht erzeugt werden.',
      );
    } finally {
      setGenerating(false);
    }
  }

  function startNewPayment() {
    setForm(createEmptyPayment(activeTenancies[0], year));
  }

  function selectTenancy(tenancyId: string) {
    if (!form) return;
    const tenancy = data.tenancies.find((item) => item.id === Number(tenancyId));
    setForm(
      tenancy
        ? { ...createEmptyPayment(tenancy, year), id: form.id, revision: form.revision }
        : { ...form, tenancyId },
    );
  }

  async function deletePayment(payment: Payment) {
    await run(async () => {
      await deleteJson(`/api/payments/${payment.id}`, payment.revision);
    });
  }

  return (
    <>
      <PageHeader
        title={`Mietkonto ${year}`}
        subtitle="Monatliches Soll aus dem Mietvertrag erzeugen und Zahlungseingänge getrennt nach Kaltmiete, Nebenkosten und Garage erfassen."
        actions={
          <>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={!propertyId || activeTenancies.length === 0 || generating}
              onClick={() => void generateYear()}
            >
              {generating ? 'Erzeugt …' : 'Jahressoll erzeugen'}
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!propertyId || activeTenancies.length === 0}
              onClick={startNewPayment}
            >
              + Buchung
            </button>
          </>
        }
      />

      {error && <ErrorBox message={error} />}
      {notice && <Notice kind="success">{notice}</Notice>}
      {activeTenancies.length === 0 && (
        <Notice kind="warning">
          Im Jahr {year} gibt es kein aktives Mietverhältnis. Lege zuerst eines bei „Häuser &
          Wohnungen“ an.
        </Notice>
      )}

      <RentMetrics
        totalDue={totalDue}
        totalPaid={totalPaid}
        totalUtilityPaid={totalUtilityPaid}
        accountBalance={accountBalance}
      />
      <PaymentTable
        year={year}
        payments={yearPayments}
        tenancies={data.tenancies}
        units={data.units}
        totalDue={totalDue}
        totalPaid={totalPaid}
        totalUtilityPaid={totalUtilityPaid}
        accountBalance={accountBalance}
        canGenerate={activeTenancies.length > 0}
        onGenerate={() => void generateYear()}
        onEdit={(payment) => setForm(createPaymentForm(payment))}
        onDelete={deletePayment}
      />

      {form && (
        <PaymentModal
          form={form}
          activeTenancies={activeTenancies}
          units={data.units}
          formTotal={formTotal}
          error={error}
          busy={busy}
          onChange={setForm}
          onSelectTenancy={selectTenancy}
          onSave={savePayment}
          onClose={() => setForm(null)}
        />
      )}
    </>
  );
}
