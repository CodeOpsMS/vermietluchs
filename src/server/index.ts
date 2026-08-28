import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app';
import { openDatabase } from './database';

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
  db,
  staticDir: path.resolve(process.cwd(), 'dist/client'),
  allowedHosts: [host, ...allowedHosts],
});

const server = app.listen(port, host, () => {
  console.log(`Vermietluchs läuft unter http://${host}:${port}`);
});

function shutdown(): void {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
