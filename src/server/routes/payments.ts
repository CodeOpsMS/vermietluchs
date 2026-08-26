import type { Router } from 'express';
import { paymentInputSchema, type PaymentInput } from '../../shared/schemas';
import type { SqliteDatabase } from '../database';
import { ApiError } from '../errors';
import { optionalId, optionalYear, parseId, requireRevision, revisionFromIfMatch } from '../http';
import { centsToEuros, eurosToCents } from '../money';
import {
  decodeBase,
  deleteRow,
  findRow,
  insertRow,
  listRows,
  updateRow,
  type DatabaseRow,
  type DatabaseValues,
} from './shared';

const paymentColumns = [
  'tenancy_id',
  'due_date',
  'paid_date',
  'base_rent_due_cents',
  'utility_due_cents',
  'garage_due_cents',
  'amount_paid_cents',
  'base_rent_paid_cents',
  'utility_paid_cents',
  'garage_paid_cents',
  'note',
] as const;

function encodePayment(value: PaymentInput): DatabaseValues {
  const amountPaidCents = eurosToCents(value.amountPaid);
  const baseRentDueCents = eurosToCents(value.baseRentDue);
  const utilityDueCents = eurosToCents(value.utilityDue);
  const explicitParts =
    value.baseRentPaid !== undefined ||
    value.utilityPaid !== undefined ||
    value.garagePaid !== undefined;

  let baseRentPaidCents: number;
  let utilityPaidCents: number;
  let garagePaidCents: number;

  if (explicitParts) {
    baseRentPaidCents = eurosToCents(value.baseRentPaid ?? 0);
    utilityPaidCents = eurosToCents(value.utilityPaid ?? 0);
    garagePaidCents = eurosToCents(value.garagePaid ?? 0);
    if (baseRentPaidCents + utilityPaidCents + garagePaidCents !== amountPaidCents) {
      throw new ApiError(
        400,
        'Die bezahlten Teilbeträge müssen zusammen dem Zahlungseingang entsprechen.',
      );
    }
  } else {
    // Alte Clients senden nur die Gesamtsumme. Dann wird nachvollziehbar
    // zuerst die Kaltmiete, danach die Vorauszahlung und zuletzt die Garage bedient.
    baseRentPaidCents = Math.min(amountPaidCents, baseRentDueCents);
    const amountAfterRent = amountPaidCents - baseRentPaidCents;
    utilityPaidCents = Math.min(amountAfterRent, utilityDueCents);
    garagePaidCents = amountAfterRent - utilityPaidCents;
  }

  return {
    tenancy_id: value.tenancyId,
    due_date: value.dueDate,
    paid_date: value.paidDate,
    base_rent_due_cents: baseRentDueCents,
    utility_due_cents: utilityDueCents,
    garage_due_cents: eurosToCents(value.garageDue),
    amount_paid_cents: amountPaidCents,
    base_rent_paid_cents: baseRentPaidCents,
    utility_paid_cents: utilityPaidCents,
    garage_paid_cents: garagePaidCents,
    note: value.note,
  };
}

function validatePaymentPeriod(db: SqliteDatabase, input: PaymentInput): void {
  const tenancy = db
    .prepare('SELECT start_date, end_date FROM tenancies WHERE id = ?')
    .get(input.tenancyId) as { start_date: string; end_date: string | null } | undefined;
  if (!tenancy) throw new ApiError(400, 'Das gewählte Mietverhältnis existiert nicht.');
  if (
    input.dueDate < tenancy.start_date ||
    (tenancy.end_date && input.dueDate > tenancy.end_date)
  ) {
    throw new ApiError(400, 'Die Fälligkeit muss innerhalb des gewählten Mietzeitraums liegen.');
  }
}

export function decodePayment(row: DatabaseRow) {
  return {
    ...decodeBase(row),
    tenancyId: Number(row.tenancy_id),
    dueDate: String(row.due_date),
    paidDate: row.paid_date === null ? null : String(row.paid_date),
    baseRentDue: centsToEuros(Number(row.base_rent_due_cents)),
    utilityDue: centsToEuros(Number(row.utility_due_cents)),
    garageDue: centsToEuros(Number(row.garage_due_cents)),
    amountPaid: centsToEuros(Number(row.amount_paid_cents)),
    baseRentPaid: centsToEuros(Number(row.base_rent_paid_cents)),
    utilityPaid: centsToEuros(Number(row.utility_paid_cents)),
    garagePaid: centsToEuros(Number(row.garage_paid_cents)),
    note: String(row.note),
  };
}

export function registerPaymentRoutes(router: Router, db: SqliteDatabase): void {
  router.get('/payments', (request, response) => {
    const tenancyId = optionalId(request.query.tenancyId);
    const year = optionalYear(request.query.year);
    const clauses: string[] = [];
    const parameters: unknown[] = [];

    if (tenancyId !== undefined) {
      clauses.push('tenancy_id = ?');
      parameters.push(tenancyId);
    }
    if (year !== undefined) {
      clauses.push('substr(due_date, 1, 4) = ?');
      parameters.push(String(year));
    }

    const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
    const rows = listRows(db, `SELECT * FROM payments${where} ORDER BY due_date, id`, parameters);
    response.json(rows.map(decodePayment));
  });

  router.get('/payments/:id', (request, response) => {
    const row = findRow(db, 'payments', parseId(request.params.id));
    response.json(decodePayment(row));
  });

  router.post('/payments', (request, response) => {
    const input = paymentInputSchema.parse(request.body);
    validatePaymentPeriod(db, input);
    const row = insertRow(db, 'payments', paymentColumns, encodePayment(input));
    response.status(201).json(decodePayment(row));
  });

  router.put('/payments/:id', (request, response) => {
    const id = parseId(request.params.id);
    const input = paymentInputSchema.parse(request.body);
    validatePaymentPeriod(db, input);
    const row = updateRow(
      db,
      'payments',
      paymentColumns,
      id,
      requireRevision(input.revision),
      encodePayment(input),
    );
    response.json(decodePayment(row));
  });

  router.delete('/payments/:id', (request, response) => {
    deleteRow(db, 'payments', parseId(request.params.id), revisionFromIfMatch(request));
    response.status(204).end();
  });
}
