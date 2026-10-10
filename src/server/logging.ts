import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const priorities = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 } as const;
export type LogLevel = Exclude<keyof typeof priorities, 'silent'>;
export type LogOptions = {
  level?: keyof typeof priorities;
  values?: boolean;
  write?: (line: string, level: LogLevel) => void;
};

const REDACTED = '[REDACTED]';
const OMITTED = '[OMITTED]';
const secretKey =
  /password|passwd|passwort|secret|token|authorization|cookie|credential|api[-_]?key|private[-_]?key/i;
const documentKey = /base64|^payload_json$|^document(Text|Content)?$|^pageImages$/i;

function safeString(value: string): string {
  // Auch ungültige Provider-URLs dürfen keine Zugangsdaten ins Log schreiben.
  const safe = value
    .replace(/(https?:\/\/)[^\s/@]+@/gi, `$1${REDACTED}@`)
    .replace(/([?&][^\s=&#]*(?:key|token|secret|password)[^\s=&#]*=)[^\s&#]*/gi, `$1${REDACTED}`)
    .replace(/\b(Bearer|Basic)\s+[a-z0-9+/=._-]+/gi, `$1 ${REDACTED}`);
  return safe.length > 4000
    ? `${safe.slice(0, 4000)} [TRUNCATED: ${safe.length} characters]`
    : safe;
}

/** Begrenzte, rekursive Kopie: verändert weder Eingaben noch API-Antworten. */
export function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[TRUNCATED: depth]';
  if (typeof value === 'string') return safeString(value);
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    const entries = value.slice(0, 100).map((item) => sanitizeLogValue(item, depth + 1));
    if (value.length > 100) entries.push(`[TRUNCATED: ${value.length - 100} more entries]`);
    return entries;
  }
  if (typeof value === 'object') {
    const allEntries = Object.entries(value);
    const entries = allEntries
      .slice(0, 100)
      .map(([key, item]) => [
        safeString(key),
        typeof item === 'boolean' && ['clearApiKey', 'apiKeyConfigured'].includes(key)
          ? item
          : secretKey.test(key)
            ? REDACTED
            : documentKey.test(key)
              ? OMITTED
              : sanitizeLogValue(item, depth + 1),
      ]);
    if (allEntries.length > 100)
      entries.push(['[TRUNCATED]', `${allEntries.length - 100} more fields`]);
    return Object.fromEntries(entries);
  }
  return OMITTED;
}

export function createLogger(options: LogOptions = {}) {
  const configured = options.level ?? process.env.VERMIETLUCHS_LOG_LEVEL ?? 'info';
  if (!Object.hasOwn(priorities, configured)) {
    throw new Error('VERMIETLUCHS_LOG_LEVEL muss debug, info, warn, error oder silent sein.');
  }
  const configuredValues = process.env.VERMIETLUCHS_LOG_VALUES ?? 'true';
  if (options.values === undefined && !['true', 'false'].includes(configuredValues)) {
    throw new Error('VERMIETLUCHS_LOG_VALUES muss true oder false sein.');
  }
  const level = configured as keyof typeof priorities;
  const values = options.values ?? configuredValues === 'true';
  const write =
    options.write ??
    ((line: string, severity: LogLevel) => {
      if (severity === 'error' || severity === 'warn') console.error(line);
      else console.log(line);
    });
  return {
    values,
    level,
    log(severity: LogLevel, event: string, fields: Record<string, unknown> = {}) {
      if (priorities[severity] < priorities[level]) return;
      const safeFields = sanitizeLogValue(fields) as Record<string, unknown>;
      write(
        JSON.stringify({
          ...safeFields,
          timestamp: new Date().toISOString(),
          level: severity,
          event,
        }),
        severity,
      );
    },
  };
}

export type AppLogger = ReturnType<typeof createLogger>;

function summarizeBackup(body: unknown): unknown {
  if (!body || typeof body !== 'object' || !('tables' in body)) return OMITTED;
  const tables = body.tables;
  if (!tables || typeof tables !== 'object' || Array.isArray(tables)) return OMITTED;
  return {
    content: OMITTED,
    tableRows: Object.fromEntries(
      Object.entries(tables).map(([table, rows]) => [
        table,
        Array.isArray(rows) ? rows.length : null,
      ]),
    ),
  };
}

/** Vor Host-Prüfung und JSON-Parser installieren, damit auch deren Fehler sichtbar sind. */
export function requestLogging(logger: AppLogger): RequestHandler {
  return (request, response, next) => {
    const started = performance.now();
    const requestId = randomUUID();
    const pathname = request.path;
    const api = /^\/api(?:\/|$)/i.test(pathname);
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    const backup = /^\/api\/backup\/(import|export)\/?$/i.test(pathname);
    const health = /^\/api\/health\/?$/i.test(pathname);
    const context = {
      requestId,
      method: request.method,
      path: pathname,
      clientIp: request.socket.remoteAddress,
    };
    response.setHeader('X-Request-Id', requestId);
    // Keine fremden Request-IDs oder Proxy-Header als vertrauenswürdige Identität verwenden.
    if (api && write) logger.log('info', 'api.request.started', context);

    let result: unknown;
    const originalJson = response.json;
    response.json = function (body: unknown) {
      // Leseantworten enthalten häufig ganze Datenbestände und werden nicht dupliziert.
      if (logger.values && api && (write || backup || response.statusCode >= 400)) {
        result =
          backup && body && typeof body === 'object' && 'tables' in body
            ? summarizeBackup(body)
            : body;
      }
      return originalJson.call(this, body);
    };

    let finished = false;
    const complete = (aborted: boolean) => {
      if (finished) return;
      finished = true;
      const status = response.statusCode;
      const severity = aborted
        ? 'warn'
        : status >= 500
          ? 'error'
          : status >= 400
            ? 'warn'
            : api && !health
              ? 'info'
              : 'debug';
      logger.log(severity, api ? 'api.request.completed' : 'http.request.completed', {
        ...context,
        status: aborted ? null : status,
        outcome: aborted ? 'aborted' : status >= 400 ? 'failed' : 'succeeded',
        durationMs: Math.round((performance.now() - started) * 100) / 100,
        ...(logger.values && api
          ? {
              query: request.query,
              ...(write
                ? {
                    input: backup ? summarizeBackup(request.body) : request.body,
                    revision: request.get('if-match'),
                  }
                : {}),
              ...(result === undefined ? {} : { result }),
            }
          : {}),
        ...(response.locals.logError ? { error: response.locals.logError } : {}),
      });
    };
    response.once('finish', () => complete(false));
    response.once('close', () => complete(!response.writableFinished));
    next();
  };
}
