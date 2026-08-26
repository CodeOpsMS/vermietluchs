import { previousDay, toUtc } from './date';
import type { SettlementReading } from './types';

const DAY_MS = 86_400_000;

export interface ConsumptionSegment {
  from: string;
  to: string;
  delta: number;
  days: number;
}

export interface MeterSegmentsResult {
  segments: ConsumptionSegment[];
  warnings: string[];
}

export interface PeriodConsumption {
  consumption: number;
  interpolated: boolean;
  coverageIncomplete: boolean;
  warnings: string[];
}

/** Erstellt Verbrauchssegmente; eine Wechselablesung beendet den alten Zähler. */
export function meterSegments(readings: SettlementReading[]): MeterSegmentsResult {
  const sorted = [...readings].sort((left, right) => left.date.localeCompare(right.date));
  const segments: ConsumptionSegment[] = [];
  const warnings: string[] = [];

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const days = Math.round((toUtc(current.date) - toUtc(previous.date)) / DAY_MS);
    if (days <= 0) {
      warnings.push(`Mehrere oder unsortierbare Ablesungen am ${current.date}.`);
      continue;
    }

    const delta = current.replacement
      ? (current.oldEndValue ?? 0) - previous.value
      : current.value - previous.value;
    if (delta < 0) {
      warnings.push(
        `Negativer Verbrauch zwischen ${previous.date} und ${current.date} (${delta}); ` +
          'Ablesung prüfen oder Zählerwechsel markieren.',
      );
    }
    segments.push({ from: previous.date, to: current.date, delta, days });
  }

  return { segments, warnings };
}

/**
 * Verbrauch innerhalb inklusiver Periodengrenzen. Liegt keine Ablesung genau
 * an einer Grenze, wird das umschließende Segment linear nach Tagen geteilt.
 */
export function consumptionInPeriod(
  readings: SettlementReading[],
  periodStart: string,
  periodEnd: string,
): PeriodConsumption {
  const { segments, warnings: segmentWarnings } = meterSegments(readings);
  const startBoundary = previousDay(periodStart);
  const periodStartMs = toUtc(startBoundary);
  const periodEndMs = toUtc(periodEnd);
  const dates = new Set(readings.map((reading) => reading.date));
  const interpolated = !dates.has(startBoundary) || !dates.has(periodEnd);

  let consumption = 0;
  let coveredMs = 0;
  for (const segment of segments) {
    const segmentStart = toUtc(segment.from);
    const segmentEnd = toUtc(segment.to);
    const overlapMs = Math.min(periodEndMs, segmentEnd) - Math.max(periodStartMs, segmentStart);
    if (overlapMs <= 0) continue;
    consumption += segment.delta * (overlapMs / DAY_MS / segment.days);
    coveredMs += overlapMs;
  }

  const expectedMs = Math.max(0, periodEndMs - periodStartMs);
  const coverageIncomplete = coveredMs + 0.5 < expectedMs;
  const warnings = [...segmentWarnings];
  if (coverageIncomplete) {
    warnings.push(
      `Der Zeitraum ${periodStart} bis ${periodEnd} ist nicht vollständig durch Ablesungen abgedeckt.`,
    );
  } else if (interpolated) {
    warnings.push(
      `Für ${periodStart} bis ${periodEnd} fehlt eine exakte Wechselablesung; ` +
        'der Verbrauch wurde linear nach Tagen interpoliert.',
    );
  }

  return { consumption, interpolated, coverageIncomplete, warnings };
}
