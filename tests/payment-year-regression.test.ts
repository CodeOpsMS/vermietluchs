import { describe, expect, test } from 'vitest';
import { isPaymentDueDateInYear } from '../src/client/pages/rent/paymentModel';

describe('Buchungsjahr-Validierung', () => {
  test.each(['2024-01-01', '2024-02-29', '2024-12-31'])(
    'akzeptiert %s im ausgewählten Jahr',
    (dueDate) => {
      expect(isPaymentDueDateInYear(dueDate, 2024)).toBe(true);
    },
  );

  test.each([
    '2023-12-31',
    '2025-01-01',
    '',
    '20240-01-01',
    '2024-02-30',
    '2024-13-01',
    '01.01.2024',
  ])('lehnt %s für das Jahr 2024 ab', (dueDate) => {
    expect(isPaymentDueDateInYear(dueDate, 2024)).toBe(false);
  });
});
