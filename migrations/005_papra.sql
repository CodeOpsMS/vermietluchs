CREATE TABLE papra_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  base_url TEXT NOT NULL DEFAULT '',
  public_url TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
INSERT INTO papra_settings (id) VALUES (1);

CREATE TABLE papra_property_mappings (
  id INTEGER PRIMARY KEY,
  property_id INTEGER NOT NULL UNIQUE REFERENCES properties(id) ON DELETE CASCADE,
  base_url TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
) STRICT;

CREATE UNIQUE INDEX costs_id_property ON costs(id, property_id);
CREATE TABLE document_links (
  id INTEGER PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  cost_id INTEGER,
  base_url TEXT NOT NULL,
  public_url TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  original_name TEXT NOT NULL,
  original_size INTEGER NOT NULL CHECK (original_size >= 0),
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cost_id, property_id) REFERENCES costs(id, property_id) ON DELETE CASCADE
) STRICT;
CREATE UNIQUE INDEX document_links_target ON document_links (
  property_id, ifnull(cost_id, 0), base_url, organization_id, document_id
);
