import { describe, expect, test } from 'vitest';
import { createEmptyCostForm, updateCostSourceAmount } from '../src/client/pages/costs/cost-model';

describe('Spiegelung des Kostenbetrags', () => {
  test('übernimmt jeden Zwischenstand beim schrittweisen Tippen', () => {
    let form = createEmptyCostForm();

    for (const sourceAmount of ['1', '10', '100', '100,5', '100,50']) {
      form = updateCostSourceAmount(form, sourceAmount);
      expect(form.sourceAmount).toBe(sourceAmount);
      expect(form.allocableAmount).toBe(sourceAmount);
    }
  });

  test('bewahrt einen bewusst abweichenden umlagefähigen Betrag', () => {
    let form = updateCostSourceAmount(createEmptyCostForm(), '100');
    form = { ...form, allocableAmount: '80' };

    form = updateCostSourceAmount(form, '1000');

    expect(form.sourceAmount).toBe('1000');
    expect(form.allocableAmount).toBe('80');
  });

  test('beginnt die Spiegelung erneut, wenn der umlagefähige Betrag leer ist', () => {
    const form = { ...createEmptyCostForm(), sourceAmount: '100', allocableAmount: '' };

    expect(updateCostSourceAmount(form, '200').allocableAmount).toBe('200');
  });
});
