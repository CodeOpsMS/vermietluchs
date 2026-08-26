export const APP_NAME = 'Vermietluchs';
export const BACKUP_SCHEMA_VERSION = 1;

export const STATEMENT_GROUPS = ['Wohnung', 'Garage', 'Grundsteuer'] as const;
export const TENANT_STATUSES = ['included', 'excluded', 'pending'] as const;
export const ALLOCATION_MODES = ['standard', 'fixedTenancy'] as const;
export const ALLOCATION_KEYS = ['area', 'persons', 'units', 'direct', 'meter'] as const;
export const METER_TYPES = ['heating', 'hotWater', 'coldWater', 'other'] as const;
