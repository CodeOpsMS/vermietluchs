import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export const notFoundHandler: RequestHandler = (_request, response) => {
  response.status(404).json({ error: 'Route nicht gefunden.' });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, next) => {
  void next; // Vier Parameter sind nötig, damit Express die Funktion als Error-Middleware erkennt.
  if (error instanceof ZodError) {
    response.status(400).json({ error: 'Die Eingabe ist ungültig.', issues: error.issues });
    return;
  }
  if (error instanceof ApiError) {
    response.status(error.status).json({ error: error.message, details: error.details });
    return;
  }
  if (error instanceof Error && error.message.includes('TENANCY_OVERLAP')) {
    response.status(409).json({ error: 'Für diese Wohnung überschneiden sich Mietverhältnisse.' });
    return;
  }
  if (error instanceof Error && error.message.includes('PAYMENT_OUTSIDE_TENANCY')) {
    response
      .status(400)
      .json({ error: 'Die Fälligkeit muss innerhalb des gewählten Mietzeitraums liegen.' });
    return;
  }
  if (error instanceof Error && error.message.includes('TENANCY_EXCLUDES_PAYMENT')) {
    response
      .status(409)
      .json({ error: 'Außerhalb des neuen Mietzeitraums sind noch Monatsbuchungen vorhanden.' });
    return;
  }
  if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
    response.status(409).json({ error: 'Dieser Datensatz ist bereits vorhanden.' });
    return;
  }
  if (error instanceof Error && error.message.includes('FOREIGN KEY constraint failed')) {
    if (request.method === 'DELETE') {
      response
        .status(409)
        .json({ error: 'Der Datensatz wird noch verwendet und kann nicht gelöscht werden.' });
    } else {
      response.status(400).json({ error: 'Ein referenzierter Datensatz existiert nicht.' });
    }
    return;
  }
  if (
    error instanceof Error &&
    'code' in error &&
    String(error.code).startsWith('SQLITE_CONSTRAINT')
  ) {
    response
      .status(409)
      .json({ error: 'Die Änderung verletzt eine Datenregel oder eine bestehende Verknüpfung.' });
    return;
  }
  console.error(error);
  response.status(500).json({ error: 'Interner Serverfehler.' });
};
