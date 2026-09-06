CREATE TABLE ai_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  provider TEXT NOT NULL DEFAULT 'ollama' CHECK (provider IN ('openai', 'mistral', 'ollama')),
  model TEXT NOT NULL DEFAULT 'qwen2.5vl:7b' CHECK (length(trim(model)) > 0),
  base_url TEXT NOT NULL DEFAULT 'http://localhost:11434' CHECK (length(trim(base_url)) > 0),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

INSERT INTO ai_settings (id) VALUES (1);
