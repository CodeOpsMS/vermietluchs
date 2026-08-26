CREATE TABLE app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  landlord_name TEXT NOT NULL DEFAULT '',
  landlord_address TEXT NOT NULL DEFAULT '',
  bank_account_holder TEXT NOT NULL DEFAULT '',
  bank_iban TEXT NOT NULL DEFAULT '',
  payment_deadline_days INTEGER NOT NULL DEFAULT 30 CHECK (payment_deadline_days BETWEEN 1 AND 365),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

INSERT INTO app_settings (id) VALUES (1);

CREATE TABLE properties (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  address TEXT NOT NULL DEFAULT '',
  landlord_name TEXT,
  landlord_address TEXT,
  bank_account_holder TEXT,
  bank_iban TEXT,
  payment_deadline_days INTEGER CHECK (payment_deadline_days BETWEEN 1 AND 365),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE units (
  id INTEGER PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  floor TEXT NOT NULL DEFAULT '',
  area_sqm REAL NOT NULL CHECK (area_sqm > 0),
  unit_weight REAL NOT NULL DEFAULT 1 CHECK (unit_weight > 0),
  notes TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (property_id, name)
) STRICT;

CREATE TABLE tenancies (
  id INTEGER PRIMARY KEY,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  tenant_name TEXT NOT NULL CHECK (length(trim(tenant_name)) > 0),
  tenant_address TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL CHECK (start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  end_date TEXT CHECK (end_date IS NULL OR end_date >= start_date),
  persons REAL NOT NULL DEFAULT 1 CHECK (persons > 0),
  base_rent_cents INTEGER NOT NULL CHECK (base_rent_cents >= 0),
  utility_prepayment_cents INTEGER NOT NULL CHECK (utility_prepayment_cents >= 0),
  garage_prepayment_cents INTEGER NOT NULL DEFAULT 0 CHECK (garage_prepayment_cents >= 0),
  payment_day INTEGER NOT NULL DEFAULT 3 CHECK (payment_day BETWEEN 1 AND 31),
  notes TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TRIGGER tenancies_no_overlap_insert
BEFORE INSERT ON tenancies
WHEN EXISTS (
  SELECT 1 FROM tenancies existing
  WHERE existing.unit_id = NEW.unit_id
    AND NOT (
      COALESCE(existing.end_date, '9999-12-31') < NEW.start_date
      OR COALESCE(NEW.end_date, '9999-12-31') < existing.start_date
    )
)
BEGIN
  SELECT RAISE(ABORT, 'TENANCY_OVERLAP');
END;

CREATE TRIGGER tenancies_no_overlap_update
BEFORE UPDATE OF unit_id, start_date, end_date ON tenancies
WHEN EXISTS (
  SELECT 1 FROM tenancies existing
  WHERE existing.unit_id = NEW.unit_id
    AND existing.id <> NEW.id
    AND NOT (
      COALESCE(existing.end_date, '9999-12-31') < NEW.start_date
      OR COALESCE(NEW.end_date, '9999-12-31') < existing.start_date
    )
)
BEGIN
  SELECT RAISE(ABORT, 'TENANCY_OVERLAP');
END;

CREATE TABLE costs (
  id INTEGER PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2200),
  description_internal TEXT NOT NULL CHECK (length(trim(description_internal)) > 0),
  description_tenant TEXT NOT NULL DEFAULT '',
  source_amount_cents INTEGER NOT NULL CHECK (source_amount_cents >= 0),
  tenant_status TEXT NOT NULL CHECK (tenant_status IN ('included', 'excluded', 'pending')),
  allocable_amount_cents INTEGER NOT NULL CHECK (allocable_amount_cents BETWEEN 0 AND source_amount_cents),
  statement_group TEXT NOT NULL CHECK (length(trim(statement_group)) > 0),
  allocation_mode TEXT NOT NULL CHECK (allocation_mode IN ('standard', 'fixedTenancy')),
  allocation_key TEXT NOT NULL CHECK (allocation_key IN ('area', 'persons', 'units', 'direct', 'meter')),
  direct_unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  direct_tenancy_id INTEGER REFERENCES tenancies(id) ON DELETE SET NULL,
  meter_type TEXT CHECK (meter_type IS NULL OR meter_type IN ('heating', 'hotWater', 'coldWater', 'other')),
  labor_35a_cents INTEGER NOT NULL DEFAULT 0 CHECK (labor_35a_cents BETWEEN 0 AND allocable_amount_cents),
  notes TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (allocation_key <> 'direct' OR direct_unit_id IS NOT NULL OR direct_tenancy_id IS NOT NULL),
  CHECK (allocation_mode <> 'fixedTenancy' OR direct_tenancy_id IS NOT NULL),
  CHECK (allocation_mode <> 'fixedTenancy' OR allocation_key = 'direct'),
  CHECK (direct_unit_id IS NULL OR direct_tenancy_id IS NULL),
  CHECK (allocation_key <> 'meter' OR meter_type IS NOT NULL)
) STRICT;

CREATE TABLE meters (
  id INTEGER PRIMARY KEY,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  meter_number TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('heating', 'hotWater', 'coldWater', 'other')),
  unit_label TEXT NOT NULL DEFAULT 'Einheiten' CHECK (length(trim(unit_label)) > 0),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE readings (
  id INTEGER PRIMARY KEY,
  meter_id INTEGER NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
  date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  value REAL NOT NULL CHECK (value >= 0),
  note TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (meter_id, date)
) STRICT;

CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  tenancy_id INTEGER NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  due_date TEXT NOT NULL CHECK (due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  paid_date TEXT CHECK (paid_date IS NULL OR paid_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  base_rent_due_cents INTEGER NOT NULL CHECK (base_rent_due_cents >= 0),
  utility_due_cents INTEGER NOT NULL CHECK (utility_due_cents >= 0),
  garage_due_cents INTEGER NOT NULL DEFAULT 0 CHECK (garage_due_cents >= 0),
  amount_paid_cents INTEGER NOT NULL CHECK (amount_paid_cents >= 0),
  base_rent_paid_cents INTEGER NOT NULL DEFAULT 0 CHECK (base_rent_paid_cents >= 0),
  utility_paid_cents INTEGER NOT NULL DEFAULT 0 CHECK (utility_paid_cents >= 0),
  garage_paid_cents INTEGER NOT NULL DEFAULT 0 CHECK (garage_paid_cents >= 0),
  note TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (base_rent_paid_cents + utility_paid_cents + garage_paid_cents = amount_paid_cents),
  CHECK (amount_paid_cents = 0 OR paid_date IS NOT NULL),
  UNIQUE (tenancy_id, due_date)
) STRICT;

CREATE TRIGGER payments_within_tenancy_insert
BEFORE INSERT ON payments
WHEN NOT EXISTS (
  SELECT 1 FROM tenancies tenancy
  WHERE tenancy.id = NEW.tenancy_id
    AND NEW.due_date >= tenancy.start_date
    AND NEW.due_date <= COALESCE(tenancy.end_date, '9999-12-31')
)
BEGIN
  SELECT RAISE(ABORT, 'PAYMENT_OUTSIDE_TENANCY');
END;

CREATE TRIGGER payments_within_tenancy_update
BEFORE UPDATE OF tenancy_id, due_date ON payments
WHEN NOT EXISTS (
  SELECT 1 FROM tenancies tenancy
  WHERE tenancy.id = NEW.tenancy_id
    AND NEW.due_date >= tenancy.start_date
    AND NEW.due_date <= COALESCE(tenancy.end_date, '9999-12-31')
)
BEGIN
  SELECT RAISE(ABORT, 'PAYMENT_OUTSIDE_TENANCY');
END;

CREATE TRIGGER tenancies_keep_existing_payments
BEFORE UPDATE OF start_date, end_date ON tenancies
WHEN EXISTS (
  SELECT 1 FROM payments payment
  WHERE payment.tenancy_id = NEW.id
    AND (
      payment.due_date < NEW.start_date
      OR payment.due_date > COALESCE(NEW.end_date, '9999-12-31')
    )
)
BEGIN
  SELECT RAISE(ABORT, 'TENANCY_EXCLUDES_PAYMENT');
END;

CREATE TABLE settlement_snapshots (
  id INTEGER PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  tenancy_id INTEGER NOT NULL REFERENCES tenancies(id) ON DELETE RESTRICT,
  year INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2200),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenancy_id, year)
) STRICT;

CREATE INDEX units_property_idx ON units(property_id);
CREATE INDEX tenancies_unit_period_idx ON tenancies(unit_id, start_date, end_date);
CREATE INDEX costs_property_year_idx ON costs(property_id, year);
CREATE INDEX meters_unit_idx ON meters(unit_id);
CREATE UNIQUE INDEX meters_number_unique_idx ON meters(unit_id, meter_number) WHERE meter_number <> '';
CREATE INDEX readings_meter_date_idx ON readings(meter_id, date);
CREATE UNIQUE INDEX payments_tenancy_month_unique_idx
  ON payments(tenancy_id, substr(due_date, 1, 7));
CREATE INDEX snapshots_property_year_idx ON settlement_snapshots(property_id, year);
