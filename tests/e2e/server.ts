import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../src/server/app';
import { openDatabase } from '../../src/server/database';

const host = '127.0.0.1';
const port = 3101;
const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'vermietluchs-e2e-'));
const db = openDatabase(path.join(dataDirectory, 'vermietluchs.sqlite'), {
  migrationsDir: path.resolve('migrations'),
});
const app = createApp({ db, staticDir: path.resolve('dist/client') });
const server = app.listen(port, host, () => {
  console.log(`E2E-Server läuft unter http://${host}:${port}`);
});

function cleanup(): void {
  db.close();
  fs.rmSync(dataDirectory, { recursive: true, force: true });
}

function shutdown(): void {
  server.close(() => {
    cleanup();
    process.exit(0);
  });
}

server.on('error', (error) => {
  cleanup();
  throw error;
});
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
