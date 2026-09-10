import fs from 'node:fs';
import path from 'node:path';
import { createFileAiSecretStore } from './ai/secrets';
import { createApp } from './app';
import { openDatabase } from './database';
import { createLogger } from './logging';

const logger = createLogger();
const dataDir = path.resolve(process.env.VERMIETLUCHS_DATA_DIR ?? path.join(process.cwd(), 'data'));
fs.mkdirSync(dataDir, { recursive: true });
const db = openDatabase(path.join(dataDir, 'vermietluchs.sqlite'));
const port = Number(process.env.VERMIETLUCHS_PORT ?? 3001);
const host = process.env.VERMIETLUCHS_HOST ?? '127.0.0.1';
const allowedHosts = (process.env.VERMIETLUCHS_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const app = createApp({
  logger,
  db,
  staticDir: path.resolve(process.cwd(), 'dist/client'),
  allowedHosts: [host, ...allowedHosts],
  aiSecretStore: createFileAiSecretStore(dataDir),
});

const server = app.listen(port, host, () => {
  logger.log('info', 'server.started', {
    host,
    port,
    version: process.env.VERMIETLUCHS_VERSION ?? 'development',
    logLevel: logger.level,
    logValues: logger.values,
  });
});

function shutdown(): void {
  logger.log('info', 'server.stopping');
  server.close(() => {
    db.close();
    logger.log('info', 'server.stopped');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
