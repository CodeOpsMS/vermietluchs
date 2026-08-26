import type { Router } from 'express';
import type { SqliteDatabase } from '../database';
import { registerCostRoutes } from './costs';
import { registerMeterRoutes } from './meters';
import { registerPaymentRoutes } from './payments';
import { registerPropertyRoutes } from './properties';
import { registerReadingRoutes } from './readings';
import { registerTenancyRoutes } from './tenancies';
import { registerUnitRoutes } from './units';

/**
 * Der Einstiegspunkt listet die Routen bewusst einzeln auf. So ist für Einsteiger
 * direkt sichtbar, welche fachlichen Bereiche die API anbietet.
 */
export function registerResourceRoutes(router: Router, db: SqliteDatabase): void {
  registerPropertyRoutes(router, db);
  registerUnitRoutes(router, db);
  registerTenancyRoutes(router, db);
  registerCostRoutes(router, db);
  registerMeterRoutes(router, db);
  registerReadingRoutes(router, db);
  registerPaymentRoutes(router, db);
}
