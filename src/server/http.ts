import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import { ApiError } from './errors';

const positiveInteger = z.coerce.number().int().positive();
const year = z.coerce.number().int().min(1900).max(2200);

export function parseId(value: string): number {
  return positiveInteger.parse(value);
}

export function optionalId(value: unknown): number | undefined {
  if (value === undefined || value === '') return undefined;
  return positiveInteger.parse(value);
}

export function optionalYear(value: unknown): number | undefined {
  if (value === undefined || value === '') return undefined;
  return year.parse(value);
}

export function requireRevision(value: unknown): number {
  return z.number().int().nonnegative().parse(value);
}

export function revisionFromIfMatch(request: Request): number {
  const raw = request.get('if-match');
  if (!raw)
    throw new ApiError(
      428,
      'Für diese Änderung fehlt der If-Match-Header mit der aktuellen Revision.',
    );
  const normalized = raw.replace(/^W\//, '').replace(/^"|"$/g, '');
  const revision = Number(normalized);
  if (!Number.isInteger(revision) || revision < 0) {
    throw new ApiError(400, 'Der If-Match-Header enthält keine gültige Revision.');
  }
  return revision;
}

export const sameOriginWrites: RequestHandler = (request, _response, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    next();
    return;
  }

  const fetchSite = request.get('sec-fetch-site');
  const origin = request.get('origin');
  const expectedOrigin = `${request.protocol}://${request.get('host')}`;
  if (fetchSite === 'cross-site' || (origin && origin !== expectedOrigin)) {
    next(new ApiError(403, 'Schreibzugriffe sind nur vom selben Ursprung erlaubt.'));
    return;
  }
  if (request.is('application/json') === false) {
    next(new ApiError(415, 'Schreibzugriffe erwarten application/json.'));
    return;
  }
  next();
};
