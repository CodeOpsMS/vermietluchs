import { afterEach, describe, expect, test, vi } from 'vitest';
import { applyTheme, readInitialTheme } from '../src/client/theme';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Farbschema', () => {
  test.each(['light', 'dark'] as const)('bevorzugt das gespeicherte Schema %s', (theme) => {
    const matchMedia = vi.fn();
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue(theme) });
    vi.stubGlobal('window', { matchMedia });

    expect(readInitialTheme()).toBe(theme);
    expect(matchMedia).not.toHaveBeenCalled();
  });

  test.each([
    [true, 'dark'],
    [false, 'light'],
  ] as const)('fällt bei Systemeinstellung dark=%s auf %s zurück', (matches, expected) => {
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue(null) });
    vi.stubGlobal('window', { matchMedia: vi.fn().mockReturnValue({ matches }) });

    expect(readInitialTheme()).toBe(expected);
  });

  test.each([
    ['dark', '#191715'],
    ['light', '#f3f0eb'],
  ] as const)('wendet %s auf Dokument und Browserfarbe an', (theme, color) => {
    const setAttribute = vi.fn();
    const documentElement = { dataset: {}, style: {} };
    const querySelector = vi.fn().mockReturnValue({ setAttribute });
    vi.stubGlobal('document', { documentElement, querySelector });

    applyTheme(theme);

    expect(documentElement).toEqual({
      dataset: { theme },
      style: { colorScheme: theme },
    });
    expect(querySelector).toHaveBeenCalledWith('meta[name="theme-color"]');
    expect(setAttribute).toHaveBeenCalledWith('content', color);
  });

  test('funktioniert auch ohne theme-color-Metaelement', () => {
    vi.stubGlobal('document', {
      documentElement: { dataset: {}, style: {} },
      querySelector: vi.fn().mockReturnValue(null),
    });

    expect(() => applyTheme('light')).not.toThrow();
  });
});
