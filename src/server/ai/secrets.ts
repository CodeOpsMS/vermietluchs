import fs from 'node:fs';
import path from 'node:path';
import type { AiProvider } from '../../shared/ai';

type StoredSecrets = Partial<Record<AiProvider, string>>;

export type AiSecretStore = {
  has(provider: AiProvider): boolean;
  read(provider: AiProvider): string | null;
  write(provider: AiProvider, apiKey: string): void;
  clear(provider: AiProvider): void;
};

export function createMemoryAiSecretStore(initial: StoredSecrets = {}): AiSecretStore {
  const secrets = new Map<AiProvider, string>(
    Object.entries(initial).filter((entry): entry is [AiProvider, string] => Boolean(entry[1])),
  );
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
    for (const provider of ['openai', 'mistral', 'ollama'] as const) {
      const value = (parsed as Record<string, unknown>)[provider];
      if (typeof value === 'string' && value.trim()) result[provider] = value;
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
