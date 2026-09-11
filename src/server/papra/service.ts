import { createHash } from 'node:crypto';
import { PDFParse } from 'pdf-parse';
import type { PapraDocument, PapraSelection, PapraSource } from '../../shared/papra';
import type { SqliteDatabase } from '../database';
import { ApiError } from '../errors';
import { MAX_PAPRA_PDF_BYTES, papraFailure, readBounded, type PapraClient } from './client';
import type { PapraSecretStore } from './secrets';

export type PapraSettingsRow = {
  base_url: string;
  public_url: string;
  enabled: number;
  revision: number;
};
export type MappingRow = { organization_id: string; base_url: string; revision: number };
export type VerifiedDocument = {
  document: PapraDocument;
  baseUrl: string;
  publicUrl: string;
  selection: PapraSelection;
  settingsRevision: number;
};
export function createPapraService(
  db: SqliteDatabase,
  client: PapraClient,
  secrets: PapraSecretStore,
) {
  function settings(): PapraSettingsRow {
    return db.prepare('SELECT * FROM papra_settings WHERE id = 1').get() as PapraSettingsRow;
  }
  function property(propertyId: number) {
    if (!db.prepare('SELECT id FROM properties WHERE id = ?').get(propertyId))
      throw new ApiError(404, 'Das Haus existiert nicht mehr.');
  }
  function mapping(propertyId: number) {
    property(propertyId);
    return db
      .prepare('SELECT * FROM papra_property_mappings WHERE property_id = ?')
      .get(propertyId) as MappingRow | undefined;
  }
  function connection(requireConnected = true) {
    const current = settings();
    const apiKey = secrets.read(current.base_url);
    if (!current.base_url || !apiKey || (requireConnected && !current.enabled))
      throw new ApiError(
        409,
        'Bitte Papra in den Einstellungen einrichten und die Verbindung prüfen.',
      );
    return { baseUrl: current.base_url, apiKey, revision: current.revision };
  }
  function context(propertyId: number) {
    const current = connection();
    const assigned = mapping(propertyId);
    if (!assigned?.organization_id || assigned.base_url !== current.baseUrl)
      throw new ApiError(
        409,
        'Bitte diesem Haus eine Organisation der aktuellen Papra-Instanz zuordnen.',
      );
    return {
      connection: current,
      organizationId: assigned.organization_id,
      settingsRevision: current.revision,
      mappingRevision: assigned.revision,
    };
  }
  function assertSelection(propertyId: number, selection: PapraSelection) {
    const current = context(propertyId);
    if (
      current.organizationId !== selection.organizationId ||
      current.settingsRevision !== selection.settingsRevision ||
      current.mappingRevision !== selection.mappingRevision
    )
      throw new ApiError(
        409,
        'Die Papra-Zuordnung wurde geändert. Bitte das Dokument erneut auswählen.',
      );
    return current;
  }
  async function verify(
    propertyId: number,
    selection: PapraSelection,
    signal?: AbortSignal,
  ): Promise<VerifiedDocument> {
    const current = assertSelection(propertyId, selection);
    const document = await client.document(
      current.connection,
      selection.organizationId,
      selection.documentId,
      signal,
    );
    assertSelection(propertyId, selection);
    return {
      document,
      baseUrl: current.connection.baseUrl,
      publicUrl: settings().public_url || current.connection.baseUrl,
      selection,
      settingsRevision: current.settingsRevision,
    };
  }
  function target(propertyId: number, costId: number | null) {
    property(propertyId);
    if (
      costId !== null &&
      !db.prepare('SELECT id FROM costs WHERE id = ? AND property_id = ?').get(costId, propertyId)
    )
      throw new ApiError(404, 'Die Kostenposition gehört nicht zu diesem Haus.');
  }
  function link(propertyId: number, costId: number | null, verified: VerifiedDocument) {
    assertSelection(propertyId, verified.selection);
    target(propertyId, costId);
    const doc = verified.document;
    db.prepare(
      `INSERT INTO document_links (property_id, cost_id, base_url, public_url, organization_id, document_id, name, mime_type, original_name, original_size, sha256)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
    ).run(
      propertyId,
      costId,
      verified.baseUrl,
      verified.publicUrl,
      doc.organizationId,
      doc.id,
      doc.name,
      doc.mimeType,
      doc.originalName,
      doc.originalSize,
      doc.originalSha256Hash,
    );
  }
  return {
    settings,
    property,
    mapping,
    connection,
    context,
    assertSelection,
    verify,
    target,
    link,
    async scanFile(propertyId: number, selection: PapraSelection, signal?: AbortSignal) {
      const verified = await verify(propertyId, selection, signal);
      const doc = verified.document;
      if (doc.mimeType !== 'application/pdf')
        throw new ApiError(400, 'Für den KI-Scan bitte ein PDF auswählen.');
      if (doc.originalSize > MAX_PAPRA_PDF_BYTES)
        throw new ApiError(413, 'Das PDF darf höchstens 20 MiB groß sein.');
      let pdf: Buffer;
      try {
        pdf = await readBounded(
          await client.file(
            assertSelection(propertyId, selection).connection,
            doc.organizationId,
            doc.id,
            signal,
          ),
          MAX_PAPRA_PDF_BYTES,
        );
      } catch (error) {
        papraFailure(error);
      }
      if (pdf.length === 0 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-')
        throw new ApiError(400, 'Die Datei ist kein gültiges PDF.');
      if (
        pdf.length !== doc.originalSize ||
        createHash('sha256').update(pdf).digest('hex') !== doc.originalSha256Hash
      )
        throw new ApiError(
          409,
          'Die Papra-Datei ist unvollständig oder wurde geändert. Bitte erneut auswählen.',
        );
      const parser = new PDFParse({ data: new Uint8Array(pdf) });
      try {
        const info = await parser.getInfo();
        if (info.total < 1) throw new Error('Empty PDF');
      } catch {
        throw new ApiError(400, 'Das PDF ist beschädigt oder kann nicht gelesen werden.');
      } finally {
        await parser.destroy();
      }
      assertSelection(propertyId, selection);
      return {
        pdf,
        fileName: doc.originalName.slice(0, 255),
        source: { ...selection, sha256: doc.originalSha256Hash } satisfies PapraSource,
      };
    },
    async verifySource(propertyId: number, source: PapraSource, signal?: AbortSignal) {
      const verified = await verify(propertyId, source, signal);
      if (
        verified.document.originalSha256Hash !== source.sha256 ||
        verified.document.mimeType !== 'application/pdf'
      )
        throw new ApiError(409, 'Das Papra-Original wurde geändert. Bitte erneut scannen.');
      return verified;
    },
  };
}
export type PapraService = ReturnType<typeof createPapraService>;
