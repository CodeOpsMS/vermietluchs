import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { SqliteDatabase } from './database';
import { registerBackupRoutes } from './backup';
import { registerChangeoverRoute } from './changeovers';
import { registerDashboardRoute } from './dashboard';
import { errorHandler, notFoundHandler } from './errors';
import { sameOriginWrites } from './http';
import { registerPaymentGenerationRoute } from './payment-generation';
import { registerResourceRoutes } from './routes';
import { sqliteSettlementCalculator } from './settlement-calculator';
import type { SettlementCalculator } from './settlements';
import { registerSettlementRoutes } from './settlements';
import { registerSettingsRoutes } from './settings';

export type AppOptions = {
  db: SqliteDatabase;
  staticDir?: string;
  settlementCalculator?: SettlementCalculator | null;
};

export function createApp(options: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    );
    next();
  });
  app.use(express.json({ limit: '50mb' }));

  const api = express.Router();
  api.use((_request, response, next) => {
    // Personen- und Abrechnungsdaten sollen nicht im Browser-Cache landen.
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.get('/health', (_request, response) => {
    const quickCheck = options.db.pragma('quick_check') as Array<{ quick_check: string }>;
    const migration = options.db
      .prepare('SELECT max(version) AS version FROM schema_migrations')
      .get() as { version: number | null };
    response.json({
      ok: quickCheck.every((entry) => entry.quick_check === 'ok'),
      database: quickCheck.map((entry) => entry.quick_check),
      schemaVersion: migration.version ?? 0,
    });
  });
  api.use(sameOriginWrites);
  registerSettingsRoutes(api, options.db);
  registerResourceRoutes(api, options.db);
  registerPaymentGenerationRoute(api, options.db);
  registerChangeoverRoute(api, options.db);
  registerDashboardRoute(api, options.db);
  registerSettlementRoutes(
    api,
    options.db,
    options.settlementCalculator === null
      ? undefined
      : (options.settlementCalculator ?? sqliteSettlementCalculator),
  );
  registerBackupRoutes(api, options.db);
  api.use(notFoundHandler);
  app.use('/api', api);

  if (options.staticDir && fs.existsSync(options.staticDir)) {
    const indexFile = path.join(options.staticDir, 'index.html');
    app.use(express.static(options.staticDir, { index: false }));
    app.use((request, response, next) => {
      if (request.method === 'GET' && request.accepts('html') && fs.existsSync(indexFile)) {
        response.sendFile(indexFile);
        return;
      }
      next();
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
