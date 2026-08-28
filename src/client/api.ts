import { describeApiError, type ApiErrorPayload } from './api-error';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const DATA_CONFLICT_EVENT = 'vermietluchs:data-conflict';

type JsonRequest = Omit<RequestInit, 'body'> & { body?: unknown };

export async function api<T>(path: string, request: JsonRequest = {}): Promise<T> {
  const headers = new Headers(request.headers);
  let body: BodyInit | undefined;

  if (request.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(request.body);
  }

  const response = await fetch(path, { ...request, headers, body });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiErrorPayload;
    const { isRevisionConflict, message } = describeApiError(response.status, payload);
    if (isRevisionConflict) {
      window.dispatchEvent(new Event(DATA_CONFLICT_EVENT));
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const getJson = <T>(path: string) => api<T>(path);
export const postJson = <T>(path: string, body: unknown) => api<T>(path, { method: 'POST', body });
export const postJsonWithRevision = <T>(path: string, body: unknown, revision: number) =>
  api<T>(path, {
    method: 'POST',
    headers: { 'If-Match': String(revision) },
    body,
  });
export const putJson = <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body });
export const deleteJson = <T>(path: string, revision?: number) =>
  api<T>(path, {
    method: 'DELETE',
    headers: revision === undefined ? undefined : { 'If-Match': String(revision) },
  });

export async function downloadBackup(): Promise<void> {
  const response = await fetch('/api/backup/export');
  if (!response.ok) throw new ApiError('Das Backup konnte nicht erstellt werden.', response.status);
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename =
    match?.[1] ?? `vermietluchs-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function importBackup(file: File): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('Die ausgewählte Datei enthält kein gültiges JSON.');
  }
  await postJson('/api/backup/import', parsed);
}
