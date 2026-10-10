import { createHash } from 'node:crypto';
import { textPdf } from './pdf';
import type { PapraDocument } from '../../src/shared/papra';

// Response fields and octet-stream download follow Papra 26.6.1 (34195e0).
export const papraTestKey = 'papra-read-test-key';
export const papraTestUrl = 'http://papra.test:1221';
export const papraProposal = {
  documentType: 'invoice' as const,
  detectedYear: 2026,
  costs: [
    {
      description: 'Papra Hausreinigung',
      amount: 125,
      statementGroup: 'Wohnung' as const,
      allocationKey: 'area' as const,
      meterType: null,
      labor35a: 20,
      confidence: 0.9,
      source: 'Seite 1',
    },
    {
      description: 'Papra Gartenpflege',
      amount: 75,
      statementGroup: 'Wohnung' as const,
      allocationKey: 'area' as const,
      meterType: null,
      labor35a: 10,
      confidence: 0.9,
      source: 'Seite 1',
    },
  ],
  readings: [],
  warnings: [],
};
export function createPapraFixture() {
  const documents = new Map<
    string,
    { metadata: PapraDocument & { content: string; isDeleted: boolean }; bytes: Buffer }
  >();
  for (const organizationId of ['org_a', 'org_b']) {
    for (let index = 1; index <= 23; index++) {
      const id = `doc_${organizationId}_${index}`;
      const pdf = index !== 3;
      const bytes = pdf
        ? textPdf(`Hausreinigung 125 EUR und Gartenpflege 75 EUR. ${id}`)
        : Buffer.from('<svg onload="alert(1)"></svg>');
      documents.set(id, {
        metadata: {
          id,
          organizationId,
          name: `Beleg ${organizationId} ${index}`,
          mimeType: pdf ? 'application/pdf' : 'image/svg+xml',
          originalName: pdf ? `papra-${id}-ä.pdf` : 'test.svg',
          originalSize: bytes.length,
          originalSha256Hash: createHash('sha256').update(bytes).digest('hex'),
          content: 'OCR_INHALT_DARF_NICHT_IM_LOG_STEHEN',
          isDeleted: false,
        },
        bytes,
      });
    }
  }
  const requests: {
    method: string;
    url: URL;
    authorization: string | null;
    redirect?: RequestRedirect;
  }[] = [];
  const state = { status: 200, permissions: ['organizations:read', 'documents:read'] };
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const authorization = new Headers(init?.headers).get('authorization');
    requests.push({ method: init?.method ?? 'GET', url, authorization, redirect: init?.redirect });
    if (authorization !== `Bearer ${papraTestKey}`)
      return Response.json({ error: { code: 'auth.unauthorized' } }, { status: 401 });
    if (state.status !== 200)
      return Response.json(
        { error: { message: 'private remote error' } },
        { status: state.status },
      );
    if (url.pathname === '/api/api-keys/current')
      return Response.json({
        apiKey: { id: 'key_1', name: 'Test', permissions: state.permissions },
      });
    if (url.pathname === '/api/organizations')
      return Response.json({
        organizations: [
          { id: 'org_a', name: 'Haus A Dokumente' },
          { id: 'org_b', name: 'Haus B Dokumente' },
        ],
      });
    const match = url.pathname.match(
      /^\/api\/organizations\/([^/]+)\/documents(?:\/([^/]+)(\/file)?)?$/,
    );
    if (!match || !['org_a', 'org_b'].includes(match[1]))
      return new Response(null, { status: 404 });
    if (!match[2]) {
      const search = url.searchParams.get('searchQuery') ?? '';
      const found = [...documents.values()].filter(
        ({ metadata }) =>
          metadata.organizationId === match[1] &&
          !metadata.isDeleted &&
          metadata.name.includes(search),
      );
      const start = Number(url.searchParams.get('pageIndex') ?? 0) * 20;
      return Response.json({
        documents: found.slice(start, start + 20).map(({ metadata }) => metadata),
        documentsCount: found.length,
      });
    }
    const document = documents.get(match[2]);
    if (!document || document.metadata.organizationId !== match[1] || document.metadata.isDeleted)
      return new Response(null, { status: 404 });
    if (match[3])
      return new Response(new Uint8Array(document.bytes), {
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': String(document.bytes.length),
          'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(document.metadata.originalName)}`,
        },
      });
    return Response.json({ document: document.metadata });
  };
  return { fetch: fetcher, documents, requests, state };
}
