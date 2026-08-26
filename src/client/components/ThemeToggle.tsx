import type { ThemeMode } from '../theme';

type ThemeToggleProps = {
  theme: ThemeMode;
  onToggle: () => void;
};

export default function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const isDark = theme === 'dark';

  return (
    <button
      className="theme-toggle"
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Nachtmodus"
      onClick={onToggle}
    >
      <span className="theme-symbol" aria-hidden="true">
        {isDark ? '☾' : '☀'}
      </span>
      <span className="theme-copy">
        <small>Darstellung</small>
        <strong>{isDark ? 'Nacht' : 'Tag'}</strong>
      </span>
      <span className="theme-track" aria-hidden="true">
        <span />
      </span>
    </button>
  );
}
