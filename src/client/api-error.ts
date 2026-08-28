export type ApiErrorPayload = {
  error?: string;
  message?: string;
  details?: { currentRevision?: unknown };
} | null;

export type ApiErrorDescription = {
  isRevisionConflict: boolean;
  message: string;
};

export function describeApiError(status: number, payload: ApiErrorPayload): ApiErrorDescription {
  const isRevisionConflict =
    status === 409 && typeof payload?.details?.currentRevision === 'number';
  const serverMessage = payload?.error ?? payload?.message ?? `Anfrage fehlgeschlagen (${status}).`;

  return {
    isRevisionConflict,
    message: isRevisionConflict
      ? `${serverMessage} Bitte lade die Daten neu und wiederhole den Vorgang.`
      : serverMessage,
  };
}
