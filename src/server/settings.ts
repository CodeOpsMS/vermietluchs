import type { Router } from 'express';
import { settingsInputSchema } from '../shared/schemas';
import type { SqliteDatabase } from './database';
import { ApiError } from './errors';

type SettingsRow = {
  landlord_name: string;
  landlord_address: string;
  bank_account_holder: string;
  bank_iban: string;
  payment_deadline_days: number;
  revision: number;
  updated_at: string;
};

function decode(row: SettingsRow) {
  return {
    landlordName: row.landlord_name,
    landlordAddress: row.landlord_address,
    bankAccountHolder: row.bank_account_holder,
    bankIban: row.bank_iban,
    paymentDeadlineDays: row.payment_deadline_days,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

function get(db: SqliteDatabase): SettingsRow {
  return db.prepare('SELECT * FROM app_settings WHERE id = 1').get() as SettingsRow;
}

export function registerSettingsRoutes(router: Router, db: SqliteDatabase): void {
  router.get('/settings', (_request, response) => response.json(decode(get(db))));
  router.put('/settings', (request, response) => {
    const input = settingsInputSchema.parse(request.body);
    const row = db
      .prepare(
        `
      UPDATE app_settings SET
        landlord_name = @landlordName,
        landlord_address = @landlordAddress,
        bank_account_holder = @bankAccountHolder,
        bank_iban = @bankIban,
        payment_deadline_days = @paymentDeadlineDays,
        revision = revision + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1 AND revision = @revision
      RETURNING *
    `,
      )
      .get(input) as SettingsRow | undefined;
    if (!row) {
      const current = get(db);
      throw new ApiError(409, 'Die Einstellungen wurden zwischenzeitlich geändert.', {
        currentRevision: current.revision,
      });
    }
    response.json(decode(row));
  });
}
