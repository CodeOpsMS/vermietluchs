import type { Router } from 'express';
import { propertyInputSchema, type PropertyInput } from '../../shared/schemas';
import type { SqliteDatabase } from '../database';
import { parseId, requireRevision, revisionFromIfMatch } from '../http';
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

const propertyColumns = [
  'name',
  'address',
  'landlord_name',
  'landlord_address',
  'bank_account_holder',
  'bank_iban',
  'payment_deadline_days',
] as const;

function encodeProperty(value: PropertyInput): DatabaseValues {
  return {
    name: value.name,
    address: value.address,
    landlord_name: value.landlordName,
    landlord_address: value.landlordAddress,
    bank_account_holder: value.bankAccountHolder,
    bank_iban: value.bankIban,
    payment_deadline_days: value.paymentDeadlineDays,
  };
}

export function decodeProperty(row: DatabaseRow) {
  return {
    ...decodeBase(row),
    name: String(row.name),
    address: String(row.address),
    landlordName: row.landlord_name === null ? null : String(row.landlord_name),
    landlordAddress: row.landlord_address === null ? null : String(row.landlord_address),
    bankAccountHolder: row.bank_account_holder === null ? null : String(row.bank_account_holder),
    bankIban: row.bank_iban === null ? null : String(row.bank_iban),
    paymentDeadlineDays:
      row.payment_deadline_days === null ? null : Number(row.payment_deadline_days),
  };
}

export function registerPropertyRoutes(router: Router, db: SqliteDatabase): void {
  router.get('/properties', (_request, response) => {
    const rows = listRows(db, 'SELECT * FROM properties ORDER BY id');
    response.json(rows.map(decodeProperty));
  });

  router.get('/properties/:id', (request, response) => {
    const row = findRow(db, 'properties', parseId(request.params.id));
    response.json(decodeProperty(row));
  });

  router.post('/properties', (request, response) => {
    const input = propertyInputSchema.parse(request.body);
    const row = insertRow(db, 'properties', propertyColumns, encodeProperty(input));
    response.status(201).json(decodeProperty(row));
  });

  router.put('/properties/:id', (request, response) => {
    const id = parseId(request.params.id);
    const input = propertyInputSchema.parse(request.body);
    const row = updateRow(
      db,
      'properties',
      propertyColumns,
      id,
      requireRevision(input.revision),
      encodeProperty(input),
    );
    response.json(decodeProperty(row));
  });

  router.delete('/properties/:id', (request, response) => {
    deleteRow(db, 'properties', parseId(request.params.id), revisionFromIfMatch(request));
    response.status(204).end();
  });
}
