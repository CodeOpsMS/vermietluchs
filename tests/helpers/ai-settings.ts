import type { AiSettings } from '../../src/shared/ai';

export const DISABLED_AI_SETTINGS: AiSettings = {
  enabled: false,
  provider: 'ollama',
  model: 'test-model',
  baseUrl: 'http://localhost:11434',
  documentMode: 'auto',
  outputMode: 'json_schema',
  apiKeyConfigured: false,
  revision: 0,
  updatedAt: '2026-09-07T08:00:00Z',
};
