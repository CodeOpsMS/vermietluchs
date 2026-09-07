CREATE TABLE ai_settings_next (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  provider TEXT NOT NULL DEFAULT 'ollama' CHECK (provider IN ('openai', 'mistral', 'ollama', 'compatible')),
  model TEXT NOT NULL CHECK (length(trim(model)) > 0),
  base_url TEXT NOT NULL CHECK (length(trim(base_url)) > 0),
  document_mode TEXT NOT NULL DEFAULT 'auto' CHECK (document_mode IN ('auto', 'text', 'images')),
  output_mode TEXT NOT NULL DEFAULT 'json_schema' CHECK (output_mode IN ('json_schema', 'json_object', 'prompt')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

INSERT INTO ai_settings_next (id, enabled, provider, model, base_url, revision, updated_at)
SELECT id, enabled, provider, model, base_url, revision, updated_at FROM ai_settings;
DROP TABLE ai_settings;
ALTER TABLE ai_settings_next RENAME TO ai_settings;
