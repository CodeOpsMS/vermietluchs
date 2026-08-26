import { today } from '../../format';
import type { Property, Tenancy, Unit } from '../../types';

export type PropertyForm = {
  id?: number;
  revision?: number;
  name: string;
  address: string;
  landlordName: string;
  landlordAddress: string;
  bankAccountHolder: string;
  bankIban: string;
  paymentDeadlineDays: string;
};

export type UnitForm = {
  id?: number;
  revision?: number;
  name: string;
  floor: string;
  areaSqm: string;
  unitWeight: string;
  notes: string;
};

export type TenancyForm = {
  id?: number;
  revision?: number;
  unitId: number;
  tenantName: string;
  tenantAddress: string;
  startDate: string;
  endDate: string;
  persons: string;
  baseRent: string;
  utilityPrepayment: string;
  garagePrepayment: string;
  paymentDay: string;
  notes: string;
};

function numberForInput(value: number): string {
  return String(value).replace('.', ',');
}

export function createEmptyPropertyForm(): PropertyForm {
  return {
    name: '',
    address: '',
    landlordName: '',
    landlordAddress: '',
    bankAccountHolder: '',
    bankIban: '',
    paymentDeadlineDays: '',
  };
}

export function propertyToForm(property: Property): PropertyForm {
  return {
    id: property.id,
    revision: property.revision,
    name: property.name,
    address: property.address,
    landlordName: property.landlordName ?? '',
    landlordAddress: property.landlordAddress ?? '',
    bankAccountHolder: property.bankAccountHolder ?? '',
    bankIban: property.bankIban ?? '',
    paymentDeadlineDays: property.paymentDeadlineDays ? String(property.paymentDeadlineDays) : '',
  };
}

export function createEmptyUnitForm(): UnitForm {
  return {
    name: '',
    floor: '',
    areaSqm: '',
    unitWeight: '1',
    notes: '',
  };
}

export function unitToForm(unit: Unit): UnitForm {
  return {
    id: unit.id,
    revision: unit.revision,
    name: unit.name,
    floor: unit.floor,
    areaSqm: numberForInput(unit.areaSqm),
    unitWeight: numberForInput(unit.unitWeight),
    notes: unit.notes,
  };
}

export function createEmptyTenancyForm(
  unitId: number,
  year = Number(today().slice(0, 4)),
): TenancyForm {
  return {
    unitId,
    tenantName: '',
    tenantAddress: '',
    startDate: `${year}-01-01`,
    endDate: '',
    persons: '1',
    baseRent: '',
    utilityPrepayment: '',
    garagePrepayment: '0',
    paymentDay: '3',
    notes: '',
  };
}

export function tenancyToForm(tenancy: Tenancy): TenancyForm {
  return {
    id: tenancy.id,
    revision: tenancy.revision,
    unitId: tenancy.unitId,
    tenantName: tenancy.tenantName,
    tenantAddress: tenancy.tenantAddress,
    startDate: tenancy.startDate,
    endDate: tenancy.endDate ?? '',
    persons: numberForInput(tenancy.persons),
    baseRent: numberForInput(tenancy.baseRent),
    utilityPrepayment: numberForInput(tenancy.utilityPrepayment),
    garagePrepayment: numberForInput(tenancy.garagePrepayment),
    paymentDay: String(tenancy.paymentDay),
    notes: tenancy.notes,
  };
}
