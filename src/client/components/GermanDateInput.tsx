import { useEffect, useRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { germanDateToIso, isoDateToGermanInput } from '../format';

type GermanDateInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'inputMode' | 'maxLength' | 'onChange' | 'pattern' | 'placeholder' | 'type' | 'value'
> & {
  value: string;
  onChange: (isoDate: string) => void;
};

/**
 * Zeigt Datumswerte immer als TT.MM.JJJJ an. Der restliche Code arbeitet
 * weiterhin mit dem für Datenbank und Vergleiche geeigneten ISO-Format.
 */
export function GermanDateInput({ value, onChange, onBlur, ...props }: GermanDateInputProps) {
  const externalText = isoDateToGermanInput(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.value = externalText;
    inputRef.current.setCustomValidity('');
  }, [externalText]);

  return (
    <input
      {...props}
      ref={inputRef}
      type="text"
      inputMode="text"
      maxLength={10}
      pattern="[0-9]{2}[.][0-9]{2}[.][0-9]{4}"
      placeholder="TT.MM.JJJJ"
      defaultValue={externalText}
      onChange={(event) => {
        const entered = event.currentTarget.value;
        const isoDate = germanDateToIso(entered);
        event.currentTarget.setCustomValidity(
          !entered || isoDate ? '' : 'Bitte ein gültiges Datum als TT.MM.JJJJ eingeben.',
        );
        if (!entered) onChange('');
        else if (isoDate) onChange(isoDate);
      }}
      onBlur={(event) => {
        if (event.currentTarget.value && !germanDateToIso(event.currentTarget.value)) {
          // Den Tippfehler sichtbar stehen lassen und das Speichern blockieren. Vor allem bei
          // optionalen Feldern darf ein ungültiges Datum nicht still zu "kein Datum" werden.
          event.currentTarget.setCustomValidity(
            'Bitte ein gültiges Datum als TT.MM.JJJJ eingeben.',
          );
        }
        onBlur?.(event);
      }}
    />
  );
}
