import { z } from 'zod';
import { AssertionError } from 'node:assert';
import { ApiError } from '../src/server/errors';
import { papraBaseUrlSchema, papraIdSchema } from '../src/shared/papra';
import { runPapraCheck } from './papra-check';

// Credentials enter via stdin, never command-line arguments or repository files.
let input = '';
try {
  for await (const chunk of process.stdin) {
    input += String(chunk);
    if (input.length > 8192) throw new Error('Input too large');
  }
  const config = z
    .object({
      baseUrl: papraBaseUrlSchema,
      apiKey: z.string().min(1).max(1000),
      organizationId: papraIdSchema,
      documentId: papraIdSchema,
    })
    .strict()
    .parse(JSON.parse(input));
  input = '';
  console.log(JSON.stringify(await runPapraCheck(config, process.env.PAPRA_CHECK_MIGRATIONS_DIR)));
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.name : 'UnknownError',
      ...(error instanceof AssertionError || error instanceof ApiError
        ? { message: error.message }
        : {}),
      ...(error instanceof ApiError ? { status: error.status, details: error.details } : {}),
    }),
  );
  process.exitCode = 1;
}
