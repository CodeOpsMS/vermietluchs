CREATE TABLE operating_cost_plans (
  id INTEGER PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  tenancy_id INTEGER NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2200),
  housing_costs_cents INTEGER NOT NULL CHECK (housing_costs_cents >= 0),
  garage_costs_cents INTEGER NOT NULL DEFAULT 0 CHECK (garage_costs_cents >= 0),
  property_tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (property_tax_cents >= 0),
  months INTEGER NOT NULL DEFAULT 12 CHECK (months BETWEEN 1 AND 12),
  monthly_prepayment_cents INTEGER CHECK (
    monthly_prepayment_cents IS NULL OR monthly_prepayment_cents >= 0
  ),
  notes TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenancy_id, year)
) STRICT;

CREATE INDEX operating_cost_plans_property_year_idx
  ON operating_cost_plans(property_id, year);
