import { consumptionInPeriod } from './consumption';
import { daysInYear, personDaysInPeriod, personsAt, tenancyPeriod } from './date';
import { calculatePrepayments } from './prepayments';
import { distributeCents } from './rounding';
import type {
  AllocationKey,
  CostCalculationResult,
  DomainId,
  MeterType,
  OwnerReason,
  OwnerRow,
  SettlementCost,
  SettlementGroupResult,
  SettlementInput,
  SettlementMeter,
  SettlementReading,
  SettlementResult,
  SettlementRow,
  SettlementTenancy,
  SettlementUnit,
  StatementGroup,
  TenancyStatement,
} from './types';

const STANDARD_GROUPS: StatementGroup[] = ['Wohnung', 'Garage', 'Grundsteuer'];

interface ActiveTenancy {
  tenancy: SettlementTenancy;
  unit: SettlementUnit;
  period: { start: string; end: string; days: number };
  personDays: number;
}

interface RawTarget {
  active: ActiveTenancy;
  rawCents: number;
  basisText: string;
}

interface MeterBasis {
  meters: SettlementMeter[];
  readingsByMeter: Map<DomainId, SettlementReading[]>;
  annualConsumption: number;
}

function assertCents(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${field} muss ein nichtnegativer ganzzahliger Centbetrag sein.`);
  }
}

function validateCost(cost: SettlementCost): void {
  assertCents(cost.sourceAmountCents, `Originalbetrag von „${cost.descriptionInternal}“`);
  assertCents(cost.allocableAmountCents, `Umlagebetrag von „${cost.descriptionInternal}“`);
  assertCents(cost.labor35aCents ?? 0, `§35a-Anteil von „${cost.descriptionInternal}“`);
  if (cost.allocableAmountCents > cost.sourceAmountCents) {
    throw new TypeError(
      `Der Umlagebetrag von „${cost.descriptionInternal}“ übersteigt den Originalbetrag.`,
    );
  }
  if ((cost.labor35aCents ?? 0) > cost.allocableAmountCents) {
    throw new TypeError(
      `Der §35a-Anteil von „${cost.descriptionInternal}“ übersteigt den Umlagebetrag.`,
    );
  }
}

function formatNumber(value: number): string {
  return value.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

function uniquePush(target: string[], message: string): void {
  if (!target.includes(message)) target.push(message);
}

function createStatements(
  activeTenancies: ActiveTenancy[],
  year: number,
  yearDays: number,
): Map<DomainId, TenancyStatement> {
  const statements = new Map<DomainId, TenancyStatement>();
  for (const active of activeTenancies) {
    const prepayment = calculatePrepayments(active.tenancy, year);
    const isPartialYear = active.period.days < yearDays;
    const notes = isPartialYear
      ? [
          `Teiljahresabrechnung ${active.period.start} bis ${active.period.end} ` +
            `(${active.period.days}/${yearDays} Tage).`,
          'Für ein Teiljahr wird keine automatische 1/12-Empfehlung zur Vorauszahlung berechnet.',
        ]
      : [];
    statements.set(active.tenancy.id, {
      tenancyId: active.tenancy.id,
      unitId: active.unit.id,
      tenantName: active.tenancy.tenantName,
      unitName: active.unit.name,
      periodStart: active.period.start,
      periodEnd: active.period.end,
      days: active.period.days,
      personsAtPeriodEnd: personsAt(active.tenancy, active.period.end),
      isPartialYear,
      notes,
      rows: [],
      groups: [],
      prepaymentCents: prepayment.totalCents,
      prepaymentsByGroup: prepayment.byGroup,
      totalCostShareBeforeRoundingCents: 0,
      roundingDifferenceCents: 0,
      totalShareCents: 0,
      total35aCents: 0,
      balanceCents: 0,
      suggestedMonthlyPrepaymentCents: null,
    });
  }
  return statements;
}

function createMeterBases(
  input: SettlementInput,
  eligibleUnits: Set<DomainId>,
  warnings: string[],
): Map<MeterType, MeterBasis> {
  const meters = (input.meters ?? []).filter((meter) => eligibleUnits.has(meter.unitId));
  const readingsByMeter = new Map<DomainId, SettlementReading[]>();
  for (const reading of input.readings ?? []) {
    const list = readingsByMeter.get(reading.meterId) ?? [];
    list.push(reading);
    readingsByMeter.set(reading.meterId, list);
  }

  const result = new Map<MeterType, MeterBasis>();
  const yearStart = `${input.year}-01-01`;
  const yearEnd = `${input.year}-12-31`;
  for (const meter of meters) {
    const meterReadings = readingsByMeter.get(meter.id) ?? [];
    const annual = consumptionInPeriod(meterReadings, yearStart, yearEnd);
    for (const warning of annual.warnings) {
      uniquePush(warnings, `Zähler „${meter.name ?? meter.id}“: ${warning}`);
    }
    const current = result.get(meter.type) ?? {
      meters: [],
      readingsByMeter,
      annualConsumption: 0,
    };
    current.meters.push(meter);
    current.annualConsumption += Math.max(0, annual.consumption);
    result.set(meter.type, current);
  }
  return result;
}

function fixedTenancyTargets(
  cost: SettlementCost,
  activeTenancies: ActiveTenancy[],
  warnings: string[],
): RawTarget[] {
  const active = activeTenancies.find((candidate) => candidate.tenancy.id === cost.directTenancyId);
  if (!active) {
    uniquePush(
      warnings,
      `„${cost.descriptionInternal}“: Das fest zugeordnete Mietverhältnis liegt nicht im Abrechnungsjahr.`,
    );
    return [];
  }
  return [
    {
      active,
      rawCents: cost.allocableAmountCents,
      basisText: `Fester, bereits berechneter Mieteranteil für ${active.tenancy.tenantName}`,
    },
  ];
}

function areaTargets(
  cost: SettlementCost,
  activeTenancies: ActiveTenancy[],
  eligibleUnits: SettlementUnit[],
  yearDays: number,
  warnings: string[],
): RawTarget[] {
  const basis = eligibleUnits.reduce((sum, unit) => sum + unit.areaSqm, 0);
  if (basis <= 0) {
    uniquePush(warnings, `„${cost.descriptionInternal}“: Die Wohnflächenbasis fehlt.`);
    return [];
  }
  return activeTenancies.map((active) => ({
    active,
    rawCents:
      cost.allocableAmountCents * (active.unit.areaSqm / basis) * (active.period.days / yearDays),
    basisText:
      `${formatNumber(active.unit.areaSqm)} von ${formatNumber(basis)} m²` +
      (active.period.days < yearDays ? ` · ${active.period.days}/${yearDays} Tage` : ''),
  }));
}

function unitTargets(
  cost: SettlementCost,
  activeTenancies: ActiveTenancy[],
  eligibleUnits: SettlementUnit[],
  yearDays: number,
  warnings: string[],
): RawTarget[] {
  const basis = eligibleUnits.reduce((sum, unit) => sum + (unit.unitWeight ?? 1), 0);
  if (basis <= 0) {
    uniquePush(warnings, `„${cost.descriptionInternal}“: Die Einheitenbasis fehlt.`);
    return [];
  }
  return activeTenancies.map((active) => {
    const weight = active.unit.unitWeight ?? 1;
    return {
      active,
      rawCents: cost.allocableAmountCents * (weight / basis) * (active.period.days / yearDays),
      basisText:
        `${formatNumber(weight)} von ${formatNumber(basis)} Einheitengewichten` +
        (active.period.days < yearDays ? ` · ${active.period.days}/${yearDays} Tage` : ''),
    };
  });
}

function personTargets(
  cost: SettlementCost,
  activeTenancies: ActiveTenancy[],
  warnings: string[],
): RawTarget[] {
  const basis = activeTenancies.reduce((sum, active) => sum + active.personDays, 0);
  if (basis <= 0) {
    uniquePush(warnings, `„${cost.descriptionInternal}“: Die Personentagebasis fehlt.`);
    return [];
  }
  return activeTenancies.map((active) => ({
    active,
    rawCents: cost.allocableAmountCents * (active.personDays / basis),
    basisText: `${formatNumber(active.personDays)} von ${formatNumber(basis)} Personentagen`,
  }));
}

function directTargets(
  cost: SettlementCost,
  activeTenancies: ActiveTenancy[],
  yearDays: number,
  warnings: string[],
): RawTarget[] {
  const targets =
    cost.directTenancyId !== null && cost.directTenancyId !== undefined
      ? activeTenancies.filter((active) => active.tenancy.id === cost.directTenancyId)
      : activeTenancies.filter((active) => active.unit.id === cost.directUnitId);
  if (targets.length === 0) {
    uniquePush(warnings, `„${cost.descriptionInternal}“: Das Direktziel fehlt im Abrechnungsjahr.`);
  }
  return targets.map((active) => ({
    active,
    rawCents: cost.allocableAmountCents * (active.period.days / yearDays),
    basisText: `Direktzuordnung ${active.unit.name} · ${active.period.days}/${yearDays} Tage`,
  }));
}

function meterTargets(
  cost: SettlementCost,
  activeTenancies: ActiveTenancy[],
  meterBases: Map<MeterType, MeterBasis>,
  warnings: string[],
): RawTarget[] {
  if (!cost.meterType) {
    uniquePush(warnings, `„${cost.descriptionInternal}“: Die Zählerart fehlt.`);
    return [];
  }
  const basis = meterBases.get(cost.meterType);
  if (!basis || basis.annualConsumption <= 0) {
    uniquePush(
      warnings,
      `„${cost.descriptionInternal}“: Für die Zählerart ${cost.meterType} fehlt Verbrauch.`,
    );
    return [];
  }

  return activeTenancies.map((active) => {
    let consumption = 0;
    for (const meter of basis.meters.filter((candidate) => candidate.unitId === active.unit.id)) {
      const result = consumptionInPeriod(
        basis.readingsByMeter.get(meter.id) ?? [],
        active.period.start,
        active.period.end,
      );
      consumption += Math.max(0, result.consumption);
      for (const warning of result.warnings) {
        uniquePush(
          warnings,
          `Zähler „${meter.name ?? meter.id}“, ${active.tenancy.tenantName}: ${warning}`,
        );
      }
    }
    return {
      active,
      rawCents: cost.allocableAmountCents * (consumption / basis.annualConsumption),
      basisText: `${formatNumber(consumption)} von ${formatNumber(basis.annualConsumption)} gemessenen Einheiten`,
    };
  });
}

function allocationTargets(
  cost: SettlementCost,
  activeTenancies: ActiveTenancy[],
  eligibleUnits: SettlementUnit[],
  yearDays: number,
  meterBases: Map<MeterType, MeterBasis>,
  warnings: string[],
): RawTarget[] {
  if (cost.allocationMode === 'fixedTenancy') {
    return fixedTenancyTargets(cost, activeTenancies, warnings);
  }

  const strategies: Record<AllocationKey, () => RawTarget[]> = {
    area: () => areaTargets(cost, activeTenancies, eligibleUnits, yearDays, warnings),
    persons: () => personTargets(cost, activeTenancies, warnings),
    units: () => unitTargets(cost, activeTenancies, eligibleUnits, yearDays, warnings),
    direct: () => directTargets(cost, activeTenancies, yearDays, warnings),
    meter: () => meterTargets(cost, activeTenancies, meterBases, warnings),
  };
  return strategies[cost.allocationKey]();
}

function addOwnerRow(
  rows: OwnerRow[],
  cost: SettlementCost,
  reason: OwnerReason,
  shareCents: number,
  labor35aCents = 0,
): void {
  if (shareCents === 0 && labor35aCents === 0) return;
  rows.push({
    costId: cost.id,
    description: cost.descriptionInternal,
    group: cost.statementGroup,
    reason,
    shareCents,
    labor35aCents,
  });
}

function tenantRow(
  cost: SettlementCost,
  target: RawTarget,
  share: {
    rawCents: number;
    cents: number;
    allocationRoundingCents: number;
  },
  labor35aCents: number,
): SettlementRow {
  return {
    costId: cost.id,
    group: cost.statementGroup,
    description: cost.descriptionTenant || cost.descriptionInternal,
    allocationMode: cost.allocationMode,
    allocationKey: cost.allocationKey,
    basisText: target.basisText,
    rawShareCents: share.rawCents,
    shareCents: share.cents,
    allocationRoundingCents: share.allocationRoundingCents,
    labor35aCents,
    isRoundingDifference: false,
  };
}

function calculateIncludedCost(
  cost: SettlementCost,
  targets: RawTarget[],
  statements: Map<DomainId, TenancyStatement>,
  ownerRows: OwnerRow[],
  warnings: string[],
): CostCalculationResult {
  const notAllocable = cost.sourceAmountCents - cost.allocableAmountCents;
  addOwnerRow(ownerRows, cost, 'not-allocable', notAllocable);

  if (cost.allocableAmountCents === 0) {
    return {
      costId: cost.id,
      status: cost.tenantStatus,
      sourceAmountCents: cost.sourceAmountCents,
      allocableAmountCents: 0,
      tenantShareCents: 0,
      ownerShareCents: cost.sourceAmountCents,
      pendingCents: 0,
    };
  }

  if (targets.length === 0) {
    addOwnerRow(
      ownerRows,
      cost,
      'missing-basis',
      cost.allocableAmountCents,
      cost.labor35aCents ?? 0,
    );
    return {
      costId: cost.id,
      status: cost.tenantStatus,
      sourceAmountCents: cost.sourceAmountCents,
      allocableAmountCents: cost.allocableAmountCents,
      tenantShareCents: 0,
      ownerShareCents: cost.sourceAmountCents,
      pendingCents: 0,
    };
  }

  const targetRawTotal = targets.reduce((sum, target) => sum + target.rawCents, 0);
  if (targetRawTotal > cost.allocableAmountCents + 0.01) {
    uniquePush(
      warnings,
      `„${cost.descriptionInternal}“: Mietzeiträume überlappen; die Anteile wurden auf den Umlagebetrag begrenzt.`,
    );
  }
  const ownerRaw = Math.max(0, cost.allocableAmountCents - targetRawTotal);
  const rawShares = [...targets.map((target) => target.rawCents), ownerRaw];
  const shares = distributeCents(cost.allocableAmountCents, rawShares);
  const laborShares = distributeCents(
    cost.labor35aCents ?? 0,
    shares.map((share) => share.cents),
  );

  let tenantShareCents = 0;
  targets.forEach((target, index) => {
    const statement = statements.get(target.active.tenancy.id);
    if (!statement) return;
    const row = tenantRow(cost, target, shares[index], laborShares[index].cents);
    statement.rows.push(row);
    tenantShareCents += row.shareCents;
  });

  const ownerShare = shares[shares.length - 1].cents;
  const ownerLabor = laborShares[laborShares.length - 1].cents;
  addOwnerRow(ownerRows, cost, 'vacancy', ownerShare, ownerLabor);
  return {
    costId: cost.id,
    status: cost.tenantStatus,
    sourceAmountCents: cost.sourceAmountCents,
    allocableAmountCents: cost.allocableAmountCents,
    tenantShareCents,
    ownerShareCents: notAllocable + ownerShare,
    pendingCents: 0,
  };
}

function createGroups(rows: SettlementRow[]): SettlementGroupResult[] {
  const encountered = [...new Set(rows.map((row) => row.group))];
  const ordered = [
    ...STANDARD_GROUPS.filter((group) => encountered.includes(group)),
    ...encountered.filter((group) => !STANDARD_GROUPS.includes(group)),
  ];
  return ordered.map((group) => {
    const groupRows = rows.filter((row) => row.group === group);
    return {
      group,
      rows: groupRows,
      totalShareCents: groupRows.reduce((sum, row) => sum + row.shareCents, 0),
      total35aCents: groupRows.reduce((sum, row) => sum + row.labor35aCents, 0),
    };
  });
}

function finishStatements(
  input: SettlementInput,
  statements: Map<DomainId, TenancyStatement>,
  warnings: string[],
): void {
  for (const adjustment of input.roundingAdjustments ?? []) {
    if (!Number.isInteger(adjustment.amountCents)) {
      throw new TypeError(
        'Eine sichtbare Rundungsdifferenz muss ein ganzzahliger Centbetrag sein.',
      );
    }
    const statement = statements.get(adjustment.tenancyId);
    if (!statement) {
      uniquePush(
        warnings,
        `Rundungsdifferenz: Mietverhältnis ${adjustment.tenancyId} liegt nicht im Abrechnungsjahr.`,
      );
      continue;
    }
    statement.rows.push({
      costId: null,
      group: adjustment.group ?? 'Wohnung',
      description: adjustment.description ?? 'Rundungsdifferenz',
      allocationMode: 'rounding',
      allocationKey: 'rounding',
      basisText: 'Sichtbare Abstimmung zur vorgegebenen Gesamtsumme',
      rawShareCents: adjustment.amountCents,
      shareCents: adjustment.amountCents,
      allocationRoundingCents: 0,
      labor35aCents: 0,
      isRoundingDifference: true,
    });
  }

  for (const statement of statements.values()) {
    const costRows = statement.rows.filter((row) => !row.isRoundingDifference);
    statement.totalCostShareBeforeRoundingCents = costRows.reduce(
      (sum, row) => sum + row.shareCents,
      0,
    );
    statement.roundingDifferenceCents = statement.rows
      .filter((row) => row.isRoundingDifference)
      .reduce((sum, row) => sum + row.shareCents, 0);
    statement.totalShareCents =
      statement.totalCostShareBeforeRoundingCents + statement.roundingDifferenceCents;
    statement.total35aCents = costRows.reduce((sum, row) => sum + row.labor35aCents, 0);
    statement.balanceCents = statement.prepaymentCents - statement.totalShareCents;
    statement.suggestedMonthlyPrepaymentCents = statement.isPartialYear
      ? null
      : Math.round(statement.totalShareCents / 12 / 100) * 100;
    statement.groups = createGroups(statement.rows);
  }
}

/**
 * Berechnet eine vollständige Betriebskostenabrechnung für genau ein Objekt und
 * ein Kalenderjahr. Die Funktion ist rein, synchron und verändert den Input nicht.
 */
export function calculateSettlement(input: SettlementInput): SettlementResult {
  const yearDays = daysInYear(input.year);
  const periodStart = `${input.year}-01-01`;
  const periodEnd = `${input.year}-12-31`;
  const warnings: string[] = [];
  const blockingReasons: string[] = [];
  const eligibleUnits = input.units.filter((unit) => unit.participates !== false);
  const eligibleUnitIds = new Set(eligibleUnits.map((unit) => unit.id));
  const unitById = new Map(input.units.map((unit) => [unit.id, unit]));

  for (const unit of eligibleUnits) {
    if (!Number.isFinite(unit.areaSqm) || unit.areaSqm <= 0) {
      throw new TypeError(`Die Wohnfläche von „${unit.name}“ muss positiv sein.`);
    }
    if (!Number.isFinite(unit.unitWeight ?? 1) || (unit.unitWeight ?? 1) <= 0) {
      throw new TypeError(`Das Einheitengewicht von „${unit.name}“ muss positiv sein.`);
    }
  }

  const activeTenancies: ActiveTenancy[] = [];
  for (const tenancy of input.tenancies) {
    const unit = unitById.get(tenancy.unitId);
    const period = tenancyPeriod(tenancy, input.year);
    if (!unit || !period || !eligibleUnitIds.has(unit.id)) continue;
    activeTenancies.push({
      tenancy,
      unit,
      period,
      personDays: personDaysInPeriod(tenancy, periodStart, periodEnd),
    });
  }

  const statements = createStatements(activeTenancies, input.year, yearDays);
  const ownerRows: OwnerRow[] = [];
  const meterBases = createMeterBases(input, eligibleUnitIds, warnings);
  const costResults: CostCalculationResult[] = [];
  const costs = input.costs.filter((cost) => cost.year === input.year);

  for (const cost of costs) {
    validateCost(cost);
    if (cost.tenantStatus === 'excluded') {
      addOwnerRow(ownerRows, cost, 'excluded', cost.sourceAmountCents);
      costResults.push({
        costId: cost.id,
        status: cost.tenantStatus,
        sourceAmountCents: cost.sourceAmountCents,
        allocableAmountCents: cost.allocableAmountCents,
        tenantShareCents: 0,
        ownerShareCents: cost.sourceAmountCents,
        pendingCents: 0,
      });
      continue;
    }
    if (cost.tenantStatus === 'pending') {
      addOwnerRow(ownerRows, cost, 'pending', cost.sourceAmountCents);
      const reason = `„${cost.descriptionInternal}“ ist noch nicht als umlagefähig oder ausgeschlossen geprüft.`;
      blockingReasons.push(reason);
      costResults.push({
        costId: cost.id,
        status: cost.tenantStatus,
        sourceAmountCents: cost.sourceAmountCents,
        allocableAmountCents: cost.allocableAmountCents,
        tenantShareCents: 0,
        ownerShareCents: cost.sourceAmountCents,
        pendingCents: cost.sourceAmountCents,
      });
      continue;
    }

    const targets = allocationTargets(
      cost,
      activeTenancies,
      eligibleUnits,
      yearDays,
      meterBases,
      warnings,
    );
    costResults.push(calculateIncludedCost(cost, targets, statements, ownerRows, warnings));
  }

  finishStatements(input, statements, warnings);
  const statementList = [...statements.values()].sort(
    (left, right) =>
      left.unitName.localeCompare(right.unitName, 'de') ||
      left.periodStart.localeCompare(right.periodStart) ||
      left.tenantName.localeCompare(right.tenantName, 'de'),
  );
  const totalTenantCostShareCents = statementList.reduce(
    (sum, statement) => sum + statement.totalCostShareBeforeRoundingCents,
    0,
  );
  const totalVisibleRoundingDifferenceCents = statementList.reduce(
    (sum, statement) => sum + statement.roundingDifferenceCents,
    0,
  );

  return {
    year: input.year,
    periodStart,
    periodEnd,
    daysInYear: yearDays,
    statements: statementList,
    owner: {
      rows: ownerRows,
      totalCents: ownerRows.reduce((sum, row) => sum + row.shareCents, 0),
      total35aCents: ownerRows.reduce((sum, row) => sum + row.labor35aCents, 0),
    },
    costs: costResults,
    totalSourceCostsCents: costs.reduce((sum, cost) => sum + cost.sourceAmountCents, 0),
    totalIncludedAllocableCents: costs
      .filter((cost) => cost.tenantStatus === 'included')
      .reduce((sum, cost) => sum + cost.allocableAmountCents, 0),
    totalTenantCostShareCents,
    totalVisibleRoundingDifferenceCents,
    totalTenantShareCents: totalTenantCostShareCents + totalVisibleRoundingDifferenceCents,
    pendingCostsCents: costResults.reduce((sum, cost) => sum + cost.pendingCents, 0),
    canClose: blockingReasons.length === 0,
    blockingReasons,
    warnings,
  };
}
