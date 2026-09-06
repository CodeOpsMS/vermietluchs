import type { SqliteDatabase } from './database';
import { ApiError } from './errors';

/** Hält die Jahreszuordnung auch bei nachträglichen Vertragsänderungen gültig. */
export function validateTenancyYearReferences(
  db: SqliteDatabase,
  tenancyId: number,
  startDate: string,
  endDate: string | null,
): void {
  const incompatible = db
    .prepare(
      `
    SELECT id, year, kind FROM (
      SELECT id, year, 'plan' AS kind FROM operating_cost_plans WHERE tenancy_id = ?
      UNION ALL
      SELECT id, year, 'cost' AS kind FROM costs WHERE direct_tenancy_id = ?
    )
    WHERE ? > printf('%04d-12-31', year)
       OR COALESCE(?, '9999-12-31') < printf('%04d-01-01', year)
    ORDER BY year, id, kind
    LIMIT 1
  `,
    )
    .get(tenancyId, tenancyId, startDate, endDate) as
    { id: number; year: number; kind: 'plan' | 'cost' } | undefined;
  if (!incompatible) return;

  if (incompatible.kind === 'plan') {
    throw new ApiError(
      409,
      `Der Wirtschaftsplan ${incompatible.year} liegt außerhalb des neuen Mietzeitraums. Bitte prüfe und korrigiere oder lösche zuerst den betroffenen Wirtschaftsplan.`,
    );
  }
  throw new ApiError(
    409,
    `Die zugeordnete Kostenposition Nr. ${incompatible.id} für ${incompatible.year} liegt außerhalb des neuen Mietzeitraums. Bitte korrigiere zuerst die Kostenzuordnung.`,
  );
}
