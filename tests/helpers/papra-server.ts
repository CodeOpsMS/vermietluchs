import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createPapraFixture, papraProposal } from './papra';

/** Local test service only; never loaded by the production server. */
export async function startPapraTestServer(port = 0) {
  const fixture = createPapraFixture();
  const server = createServer(async (request, response) => {
    try {
      if (request.url === '/v1/chat/completions') {
        // Consume the request as a real provider would; return a deterministic AI proposal.
        for await (const chunk of request) {
          void chunk;
        }
        response.setHeader('Content-Type', 'application/json');
        response.end(
          JSON.stringify({
            choices: [
              { message: { content: JSON.stringify(papraProposal) }, finish_reason: 'stop' },
            ],
          }),
        );
        return;
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers))
        if (typeof value === 'string') headers.set(key, value);
      const result = await fixture.fetch(`http://127.0.0.1${request.url}`, {
        method: request.method,
        headers,
      });
      response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
      if (result.body)
        await pipeline(
          Readable.fromWeb(result.body as import('node:stream/web').ReadableStream),
          response,
        );
      else response.end();
    } catch {
      response.destroy();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server has no TCP address');
  return {
    fixture,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
