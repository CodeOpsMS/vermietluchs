import { parseGermanNumber } from '../../format';
import type { Payment, Tenancy } from '../../types';

export type PaymentForm = {
  id?: number;
  revision?: number;
  tenancyId: string;
  dueDate: string;
  paidDate: string;
  baseRentDue: string;
  utilityDue: string;
  garageDue: string;
  baseRentPaid: string;
  utilityPaid: string;
  garagePaid: string;
  note: string;
};

export type PaidParts = {
  baseRentPaid: number;
  utilityPaid: number;
  garagePaid: number;
};

function asInput(value: number): string {
  return String(value).replace('.', ',');
}

export function getPaidParts(payment: Payment): PaidParts {
  if (
    payment.baseRentPaid !== undefined &&
    payment.utilityPaid !== undefined &&
    payment.garagePaid !== undefined
  ) {
    return {
      baseRentPaid: payment.baseRentPaid,
      utilityPaid: payment.utilityPaid,
      garagePaid: payment.garagePaid,
    };
  }

  // Fallback für alte Backups ohne gespeicherte Aufteilung.
  const baseRentPaid = Math.min(payment.amountPaid, payment.baseRentDue);
  const afterRent = Math.max(0, payment.amountPaid - baseRentPaid);
  const utilityPaid = Math.min(afterRent, payment.utilityDue);
  return { baseRentPaid, utilityPaid, garagePaid: Math.max(0, afterRent - utilityPaid) };
}

export function parsePaidParts(form: PaymentForm): PaidParts | null {
  const baseRentPaid = parseGermanNumber(form.baseRentPaid);
  const utilityPaid = parseGermanNumber(form.utilityPaid);
  const garagePaid = parseGermanNumber(form.garagePaid);
  if (baseRentPaid === null || utilityPaid === null || garagePaid === null) return null;
  if ([baseRentPaid, utilityPaid, garagePaid].some((value) => value < 0)) return null;
  return { baseRentPaid, utilityPaid, garagePaid };
}

export function paidTotal(parts: PaidParts): number {
  return Math.round((parts.baseRentPaid + parts.utilityPaid + parts.garagePaid) * 100) / 100;
}

export function isPaymentDueDateInYear(dueDate: string, year: number): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
  if (!match || Number(match[1]) !== year) return false;

  const parsed = new Date(`${dueDate}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === dueDate;
}

function firstDueDate(tenancy: Tenancy | undefined, year: number): string {
  if (!tenancy) return '';
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const activeStart = tenancy.startDate > yearStart ? tenancy.startDate : yearStart;
  const activeEnd = tenancy.endDate && tenancy.endDate < yearEnd ? tenancy.endDate : yearEnd;
  if (activeStart > activeEnd) return '';

  const [activeYear, activeMonth] = activeStart.split('-').map(Number);
  const lastDayOfMonth = new Date(Date.UTC(activeYear, activeMonth, 0)).getUTCDate();
  const paymentDay = Math.min(tenancy.paymentDay, lastDayOfMonth);
  const contractualDate = `${activeYear}-${String(activeMonth).padStart(2, '0')}-${String(paymentDay).padStart(2, '0')}`;

  // Beginnt das Mietverhältnis nach dem vertraglichen Zahlungstag, ist der
  // Beginn des möglicherweise anteiligen Monats die erste sinnvolle Fälligkeit.
  if (contractualDate < activeStart || contractualDate > activeEnd) return activeStart;
  return contractualDate;
}

export function createEmptyPayment(tenancy: Tenancy | undefined, year: number): PaymentForm {
  const baseRent = tenancy?.baseRent ?? 0;
  const utility = tenancy?.utilityPrepayment ?? 0;
  const garage = tenancy?.garagePrepayment ?? 0;
  return {
    tenancyId: tenancy ? String(tenancy.id) : '',
    dueDate: firstDueDate(tenancy, year),
    paidDate: '',
    baseRentDue: asInput(baseRent),
    utilityDue: asInput(utility),
    garageDue: asInput(garage),
    baseRentPaid: asInput(baseRent),
    utilityPaid: asInput(utility),
    garagePaid: asInput(garage),
    note: '',
  };
}

export function createPaymentForm(payment: Payment): PaymentForm {
  const parts = getPaidParts(payment);
  return {
    id: payment.id,
    revision: payment.revision,
    tenancyId: String(payment.tenancyId),
    dueDate: payment.dueDate,
    paidDate: payment.paidDate ?? '',
    baseRentDue: asInput(payment.baseRentDue),
    utilityDue: asInput(payment.utilityDue),
    garageDue: asInput(payment.garageDue),
    baseRentPaid: asInput(parts.baseRentPaid),
    utilityPaid: asInput(parts.utilityPaid),
    garagePaid: asInput(parts.garagePaid),
    note: payment.note,
  };
}
