import { useEffect, useId, useRef } from 'react';
import type { FormEvent, ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">Vermietluchs</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {actions && <div className="page-actions no-print">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-mark" aria-hidden="true">
        ◇
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function Loading({ label = 'Daten werden geladen …' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert alert-error" role="alert">
      <strong>Das hat nicht geklappt.</strong>
      <span>{message}</span>
      {onRetry && (
        <button className="btn btn-small" type="button" onClick={onRetry}>
          Erneut versuchen
        </button>
      )}
    </div>
  );
}

export function Notice({
  children,
  kind = 'info',
}: {
  children: ReactNode;
  kind?: 'info' | 'warning' | 'success';
}) {
  return <div className={`alert alert-${kind}`}>{children}</div>;
}

export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusTimer = window.setTimeout(() => {
      if (!dialog || dialog.contains(document.activeElement)) return;
      const initialTarget = dialog.querySelector<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not(.icon-button), [tabindex]:not([tabindex="-1"])',
      );
      (initialTarget ?? dialog).focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialog)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className={`modal ${wide ? 'modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button
            className="icon-button"
            type="button"
            aria-label="Dialog schließen"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function FormActions({
  onCancel,
  submitLabel = 'Speichern',
  busy = false,
}: {
  onCancel: () => void;
  submitLabel?: string;
  busy?: boolean;
}) {
  return (
    <div className="form-actions">
      <button className="btn btn-ghost" type="button" onClick={onCancel}>
        Abbrechen
      </button>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? 'Speichert …' : submitLabel}
      </button>
    </div>
  );
}

export function SaveForm({
  children,
  onSubmit,
  className = '',
}: {
  children: ReactNode;
  onSubmit: () => void | Promise<void>;
  className?: string;
}) {
  function submit(event: FormEvent) {
    event.preventDefault();
    void onSubmit();
  }
  return (
    <form className={className} onSubmit={submit}>
      {children}
    </form>
  );
}

export function StatusPill({
  tone,
  children,
}: {
  tone: 'good' | 'warn' | 'muted' | 'bad' | 'navy';
  children: ReactNode;
}) {
  return <span className={`status status-${tone}`}>{children}</span>;
}

export function ConfirmButton({
  children,
  question,
  onConfirm,
  className = 'btn btn-danger btn-small',
}: {
  children: ReactNode;
  question: string;
  onConfirm: () => void | Promise<void>;
  className?: string;
}) {
  return (
    <button
      className={className}
      type="button"
      aria-label={question}
      onClick={() => {
        if (window.confirm(question)) void onConfirm();
      }}
    >
      {children}
    </button>
  );
}

export function FieldError({ children }: { children?: ReactNode }) {
  return children ? <p className="field-error">{children}</p> : null;
}
