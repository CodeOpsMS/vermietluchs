import type { Router } from 'express';
import { changeoverInputSchema } from '../shared/schemas';
import type { SqliteDatabase } from './database';
import { ApiError } from './errors';
import { eurosToCents } from './money';
import { decodeReading } from './routes/readings';
import { decodeTenancy } from './routes/tenancies';

type Row = Record<string, unknown>;

export function registerChangeoverRoute(router: Router, db: SqliteDatabase): void {
  router.post('/changeovers', (request, response) => {
    const input = changeoverInputSchema.parse(request.body);
    const expectedRevision = input.previousRevision;

    const result = db.transaction(() => {
      const previous = db
        .prepare('SELECT * FROM tenancies WHERE id = ?')
        .get(input.previousTenancyId) as Row | undefined;
      if (!previous) throw new ApiError(404, 'Das bisherige Mietverhältnis wurde nicht gefunden.');
      if (Number(previous.revision) !== expectedRevision) {
        throw new ApiError(409, 'Das Mietverhältnis wurde zwischenzeitlich geändert.', {
          currentRevision: Number(previous.revision),
        });
      }
      if (input.endDate < String(previous.start_date)) {
        throw new ApiError(400, 'Das Auszugsdatum darf nicht vor dem Mietbeginn liegen.');
      }
      if (input.nextTenancy.startDate <= input.endDate) {
        throw new ApiError(
          400,
          'Das neue Mietverhältnis muss nach dem Ende des bisherigen beginnen.',
        );
      }

      const futurePayments = db
        .prepare(
          `SELECT count(*) AS total,
            COALESCE(sum(CASE WHEN amount_paid_cents > 0 THEN 1 ELSE 0 END), 0) AS paid
          FROM payments
          WHERE tenancy_id = ? AND due_date > ?`,
        )
        .get(input.previousTenancyId, input.endDate) as { total: number; paid: number };
      if (futurePayments.paid > 0) {
        throw new ApiError(
          409,
          'Nach dem Auszugsdatum sind bereits Zahlungseingänge gebucht. Bitte korrigiere diese zuerst im Mietkonto.',
        );
      }
      const deletedFuturePayments = db
        .prepare(
          `DELETE FROM payments
          WHERE tenancy_id = ? AND due_date > ? AND amount_paid_cents = 0`,
        )
        .run(input.previousTenancyId, input.endDate).changes;

      const unitId = Number(previous.unit_id);
      const ended = db
        .prepare(
          `
        UPDATE tenancies
        SET end_date = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND revision = ?
        RETURNING *
      `,
        )
        .get(input.endDate, input.previousTenancyId, expectedRevision) as Row | undefined;
      if (!ended) throw new ApiError(409, 'Das Mietverhältnis wurde zwischenzeitlich geändert.');

      const next = input.nextTenancy;
      const created = db
        .prepare(
          `
        INSERT INTO tenancies (
          unit_id, tenant_name, tenant_address, start_date, end_date, persons,
          base_rent_cents, utility_prepayment_cents, garage_prepayment_cents,
          payment_day, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `,
        )
        .get(
          unitId,
          next.tenantName,
          next.tenantAddress,
          next.startDate,
          next.endDate,
          next.persons,
          eurosToCents(next.baseRent),
          eurosToCents(next.utilityPrepayment),
          eurosToCents(next.garagePrepayment),
          next.paymentDay,
          next.notes,
        ) as Row;

      const readingRows: Row[] = [];
      for (const reading of input.readings) {
        if (reading.date !== input.endDate) {
          throw new ApiError(400, 'Zwischenablesungen müssen auf das Auszugsdatum datiert sein.');
        }
        const meter = db.prepare('SELECT unit_id FROM meters WHERE id = ?').get(reading.meterId) as
          { unit_id: number } | undefined;
        if (!meter || meter.unit_id !== unitId) {
          throw new ApiError(
            400,
            'Ein Zähler der Zwischenablesung gehört nicht zur betroffenen Wohnung.',
          );
        }
        readingRows.push(
          db
            .prepare(
              `
          INSERT INTO readings (meter_id, date, value, note)
          VALUES (?, ?, ?, 'Mieterwechsel')
          RETURNING *
        `,
            )
            .get(reading.meterId, reading.date, reading.value) as Row,
        );
      }

      return {
        previousTenancy: decodeTenancy(ended),
        nextTenancy: decodeTenancy(created),
        readings: readingRows.map(decodeReading),
        deletedFuturePayments,
      };
    })();

    response.status(201).json(result);
  });
}
