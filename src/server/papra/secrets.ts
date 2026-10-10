import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type PapraSecretStore = {
  read(baseUrl: string): string | null;
  write(baseUrl: string, apiKey: string): void;
  clear(): void;
};
type Secret = { baseUrl: string; apiKey: string } | null;
export function createMemoryPapraSecretStore(): PapraSecretStore {
  let secret: Secret = null;
  return {
    read: (baseUrl) => (secret?.baseUrl === baseUrl ? secret.apiKey : null),
    write: (baseUrl, apiKey) => {
      secret = { baseUrl, apiKey };
    },
    clear: () => {
      secret = null;
    },
  };
}
export function createFilePapraSecretStore(dataDir: string): PapraSecretStore {
  const filename = path.join(dataDir, 'papra-secrets.json');
  function read(baseUrl: string): string | null {
    if (!fs.existsSync(filename)) return null;
    const value: unknown = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (
      !value ||
      typeof value !== 'object' ||
      !('baseUrl' in value) ||
      !('apiKey' in value) ||
      typeof value.baseUrl !== 'string' ||
      typeof value.apiKey !== 'string'
    ) {
      throw new Error('Der Papra-Schlüsselspeicher ist beschädigt.');
    }
    return value.baseUrl === baseUrl ? value.apiKey : null;
  }
  return {
    read,
    write(baseUrl, apiKey) {
      fs.mkdirSync(dataDir, { recursive: true });
      const temporary = path.join(dataDir, `.papra-secrets-${randomUUID()}.tmp`);
      try {
        fs.writeFileSync(temporary, JSON.stringify({ baseUrl, apiKey }), {
          mode: 0o600,
          flag: 'wx',
        });
        fs.renameSync(temporary, filename);
      } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      }
    },
    clear() {
      fs.rmSync(filename, { force: true });
    },
  };
}
