import type { Router } from 'express';
import { z } from 'zod';
import type { SqliteDatabase } from './database';
import { ApiError } from './errors';

const inputSchema = z.object({
  propertyId: z.number().int().positive(),
  year: z.number().int().min(1900).max(2200),
});

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function registerPaymentGenerationRoute(router: Router, db: SqliteDatabase): void {
  router.post('/payments/generate-year', (request, response) => {
    const { propertyId, year } = inputSchema.parse(request.body);
    if (!db.prepare('SELECT 1 FROM properties WHERE id = ?').get(propertyId)) {
      throw new ApiError(404, 'Objekt nicht gefunden.');
    }
    const tenancies = db
      .prepare(
        `
      SELECT tenancy.* FROM tenancies tenancy
      JOIN units unit ON unit.id = tenancy.unit_id
      WHERE unit.property_id = ?
        AND tenancy.start_date <= ?
        AND COALESCE(tenancy.end_date, '9999-12-31') >= ?
      ORDER BY tenancy.id
    `,
      )
      .all(propertyId, `${year}-12-31`, `${year}-01-01`) as Array<Record<string, unknown>>;
    const insert = db.prepare(`
      INSERT OR IGNORE INTO payments (
        tenancy_id, due_date, paid_date, base_rent_due_cents, utility_due_cents,
        garage_due_cents, amount_paid_cents, base_rent_paid_cents, utility_paid_cents,
        garage_paid_cents, note
      ) VALUES (?, ?, NULL, ?, ?, ?, 0, 0, 0, 0, 'Automatisch erzeugtes Monatssoll')
    `);
    const created = db.transaction(() => {
      let count = 0;
      for (const tenancy of tenancies) {
        const tenancyStart = String(tenancy.start_date);
        const tenancyEnd = tenancy.end_date === null ? null : String(tenancy.end_date);
        for (let month = 1; month <= 12; month += 1) {
          const monthKey = `${year}-${String(month).padStart(2, '0')}`;
          const firstDay = `${monthKey}-01`;
          const lastDay = `${monthKey}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
          if (tenancyStart > lastDay) continue;
          if (tenancyEnd !== null && tenancyEnd < firstDay) continue;
          const day = Math.min(Number(tenancy.payment_day), daysInMonth(year, month));
          let dueDate = `${monthKey}-${String(day).padStart(2, '0')}`;
          if (dueDate < tenancyStart) dueDate = tenancyStart;
          if (tenancyEnd !== null && dueDate > tenancyEnd) dueDate = tenancyEnd;
          count += insert.run(
            tenancy.id,
            dueDate,
            tenancy.base_rent_cents,
            tenancy.utility_prepayment_cents,
            tenancy.garage_prepayment_cents,
          ).changes;
        }
      }
      return count;
    })();
    response.status(201).json({ created });
  });
}
