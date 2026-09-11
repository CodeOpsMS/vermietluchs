import { z } from 'zod';
import { papraDocumentSchema, papraIdSchema, type PapraDocument } from '../../shared/papra';
import { ApiError } from '../errors';

export const MAX_PAPRA_PDF_BYTES = 20 * 1024 * 1024;
export type PapraConnection = { baseUrl: string; apiKey: string };
export type PapraClient = ReturnType<typeof createPapraClient>;
const organizationSchema = z.object({ id: papraIdSchema, name: z.string().min(1).max(1000) });

export async function readBounded(response: Response, maximum: number): Promise<Buffer> {
  if (Number(response.headers.get('content-length')) > maximum) {
    await response.body?.cancel();
    throw new ApiError(
      413,
      'Die Papra-Datei oder Antwort ist zu groß. PDFs für den Scan dürfen höchstens 20 MiB enthalten.',
    );
  }
  if (!response.body) throw new ApiError(502, 'Papra hat eine leere Antwort geliefert.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > maximum)
        throw new ApiError(
          413,
          'Die Papra-Datei oder Antwort ist zu groß. PDFs für den Scan dürfen höchstens 20 MiB enthalten.',
        );
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

export function papraFailure(error: unknown): never {
  if (error instanceof ApiError) throw error;
  if (error instanceof z.ZodError)
    throw new ApiError(502, 'Die Papra-Antwort entspricht nicht dem erwarteten Format.', {
      fields: error.issues.map((issue) => issue.path),
    });
  if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
    throw new ApiError(504, 'Der Papra-Zugriff wurde abgebrochen oder hat zu lange gedauert.');
  throw new ApiError(502, 'Papra ist nicht erreichbar oder hat eine ungültige Antwort geliefert.');
}

export function createPapraClient(options: { fetch?: typeof fetch; timeoutMs?: number } = {}) {
  const fetcher = options.fetch ?? fetch;
  async function request(connection: PapraConnection, route: string, signal?: AbortSignal) {
    try {
      const timeout = AbortSignal.timeout(options.timeoutMs ?? 30_000);
      const response = await fetcher(`${connection.baseUrl}/api/${route}`, {
        headers: { Authorization: `Bearer ${connection.apiKey}`, Accept: 'application/json' },
        redirect: 'manual',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (response.ok) return response;
      await response.body?.cancel();
      const messages: Record<number, string> = {
        401: 'Der Papra-Schlüssel ist ungültig. Bitte die Verbindung neu einrichten.',
        403: 'Der Papra-Schlüssel hat nicht die erforderlichen Leserechte.',
        404: 'Das Dokument oder die Organisation ist in Papra nicht mehr verfügbar.',
        429: 'Papra empfängt zu viele Anfragen. Bitte später erneut versuchen.',
      };
      throw new ApiError(
        messages[response.status] ? response.status : 502,
        messages[response.status] ??
          'Papra hat den Zugriff abgelehnt. Weiterleitungen werden nicht verfolgt.',
      );
    } catch (error) {
      papraFailure(error);
    }
  }
  async function json<T>(
    connection: PapraConnection,
    route: string,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    try {
      const response = await request(connection, route, signal);
      return schema.parse(
        JSON.parse((await readBounded(response, 8 * 1024 * 1024)).toString('utf8')),
      );
    } catch (error) {
      papraFailure(error);
    }
  }
  const documentRoute = (org: string, id?: string) =>
    `organizations/${encodeURIComponent(org)}/documents${id ? `/${encodeURIComponent(id)}` : ''}`;
  return {
    async test(connection: PapraConnection, signal?: AbortSignal) {
      const current = await json(
        connection,
        'api-keys/current',
        z.object({
          apiKey: z.object({ permissions: z.array(z.string()) }),
        }),
        signal,
      );
      if (
        !['organizations:read', 'documents:read'].every((permission) =>
          current.apiKey.permissions.includes(permission),
        )
      )
        throw new ApiError(403, 'Papra benötigt die Rechte organizations:read und documents:read.');
      return this.organizations(connection, signal);
    },
    async organizations(connection: PapraConnection, signal?: AbortSignal) {
      return (
        await json(
          connection,
          'organizations',
          z.object({ organizations: z.array(organizationSchema) }),
          signal,
        )
      ).organizations;
    },
    async documents(
      connection: PapraConnection,
      organizationId: string,
      searchQuery: string,
      pageIndex: number,
      signal?: AbortSignal,
    ) {
      const query = new URLSearchParams({
        searchQuery,
        pageIndex: String(pageIndex),
        pageSize: '20',
      });
      const result = await json(
        connection,
        `${documentRoute(organizationId)}?${query}`,
        z.object({
          documents: z.array(papraDocumentSchema).max(20),
          documentsCount: z.number().int().nonnegative(),
        }),
        signal,
      );
      if (result.documents.some((document) => document.organizationId !== organizationId))
        throw new ApiError(502, 'Papra hat Dokumente einer anderen Organisation geliefert.');
      return result;
    },
    async document(
      connection: PapraConnection,
      organizationId: string,
      documentId: string,
      signal?: AbortSignal,
    ): Promise<PapraDocument> {
      const { document } = await json(
        connection,
        documentRoute(organizationId, documentId),
        z.object({
          document: papraDocumentSchema.extend({ isDeleted: z.boolean().optional() }),
        }),
        signal,
      );
      if (
        document.organizationId !== organizationId ||
        document.id !== documentId ||
        document.isDeleted
      )
        throw new ApiError(404, 'Das Dokument ist in dieser Papra-Organisation nicht verfügbar.');
      return papraDocumentSchema.parse(document);
    },
    file(
      connection: PapraConnection,
      organizationId: string,
      documentId: string,
      signal?: AbortSignal,
    ) {
      return request(connection, `${documentRoute(organizationId, documentId)}/file`, signal);
    },
  };
}
