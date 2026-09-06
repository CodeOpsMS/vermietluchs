import fs from 'node:fs';
import path from 'node:path';
import { AI_PROVIDERS } from '../../shared/ai';

type StoredSecrets = Record<string, string>;

export type AiSecretStore = {
  has(scope: string): boolean;
  read(scope: string): string | null;
  write(scope: string, apiKey: string): void;
  clear(scope: string): void;
};

export function createMemoryAiSecretStore(initial: StoredSecrets = {}): AiSecretStore {
  const secrets = new Map(Object.entries(initial).filter((entry) => Boolean(entry[1])));
  return {
    has: (provider) => secrets.has(provider),
    read: (provider) => secrets.get(provider) ?? null,
    write: (provider, apiKey) => secrets.set(provider, apiKey),
    clear: (provider) => void secrets.delete(provider),
  };
}

export function createFileAiSecretStore(dataDir: string): AiSecretStore {
  const filename = path.join(dataDir, 'ai-secrets.json');

  function load(): StoredSecrets {
    if (!fs.existsSync(filename)) return {};
    const parsed = JSON.parse(fs.readFileSync(filename, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Der KI-Schlüsselspeicher ist beschädigt.');
    }
    const result: StoredSecrets = {};
    for (const [scope, value] of Object.entries(parsed)) {
      if (
        (AI_PROVIDERS.some((provider) => provider === scope) || scope.startsWith('compatible:')) &&
        typeof value === 'string' &&
        value.trim()
      )
        result[scope] = value;
    }
    return result;
  }

  function persist(secrets: StoredSecrets): void {
    fs.mkdirSync(dataDir, { recursive: true });
    const temporary = path.join(
      dataDir,
      `.ai-secrets-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`,
    );
    try {
      fs.writeFileSync(temporary, `${JSON.stringify(secrets, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });
      fs.renameSync(temporary, filename);
      fs.chmodSync(filename, 0o600);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }

  return {
    has: (provider) => Boolean(load()[provider]),
    read: (provider) => load()[provider] ?? null,
    write(provider, apiKey) {
      persist({ ...load(), [provider]: apiKey });
    },
    clear(provider) {
      const secrets = load();
      delete secrets[provider];
      persist(secrets);
    },
  };
}
