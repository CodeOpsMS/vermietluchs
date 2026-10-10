import { expect, test } from 'vitest';
import { runPapraCheck } from '../scripts/papra-check';
import { startPapraTestServer } from './helpers/papra-server';
import { papraTestKey } from './helpers/papra';

test('der wiederholbare Integrationstest verwendet echte HTTP-Aufrufe und lässt Originale unverändert', async () => {
  const server = await startPapraTestServer();
  try {
    expect(
      await runPapraCheck({
        baseUrl: server.baseUrl,
        apiKey: papraTestKey,
        organizationId: 'org_a',
        documentId: 'doc_org_a_1',
      }),
    ).toMatchObject({
      ok: true,
      scans: 1,
      costsCreated: 2,
      originalUnchanged: true,
      database: 'memory',
      aiProvider: 'test',
    });
    expect(server.fixture.requests.every((entry) => entry.method === 'GET')).toBe(true);
  } finally {
    await server.close();
  }
});
