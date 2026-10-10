import { useCallback, useEffect, useState } from 'react';
import type { DocumentLink } from '../../shared/papra';
import { deleteJson, getJson, postJson } from '../api';
import { ErrorBox, Loading, Modal, Notice } from './Common';
import {
  DocumentFileActions,
  PapraDocumentPicker,
  PapraOrganizationMapping,
} from './PapraDocuments';

export default function DocumentLinksModal({
  propertyId,
  costId = null,
  title,
  onClose,
}: {
  propertyId: number;
  costId?: number | null;
  title: string;
  onClose: () => void;
}) {
  const [links, setLinks] = useState<DocumentLink[] | null>(null);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setLinks(
        await getJson<DocumentLink[]>(
          `/api/document-links?propertyId=${propertyId}${costId === null ? '' : `&costId=${costId}`}`,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Belege konnten nicht geladen werden.');
    }
  }, [propertyId, costId]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  return (
    <Modal title={title} onClose={onClose} wide>
      {picker ? (
        <PapraDocumentPicker
          propertyId={propertyId}
          onCancel={() => setPicker(false)}
          onSelect={async ({ selection }) => {
            await postJson('/api/document-links', { propertyId, costId, selection });
            await load();
            setPicker(false);
          }}
        />
      ) : (
        <div className="papra-documents">
          <p>Originale bleiben in Papra. Hier werden nur Verknüpfungen gespeichert.</p>
          {costId === null && <PapraOrganizationMapping key={propertyId} propertyId={propertyId} />}
          {error && (
            <ErrorBox
              message={error}
              onRetry={() => {
                setError('');
                void load();
              }}
            />
          )}
          {!links && !error && <Loading />}
          {links?.length === 0 && <Notice>Noch keine Dokumente verknüpft.</Notice>}
          <ul className="papra-list">
            {links?.map((link) => (
              <li key={link.id}>
                <div>
                  <strong>{link.name}</strong>
                  <small>{(link.originalSize / 1024).toFixed(1)} KiB</small>
                </div>
                {!link.available && (
                  <Notice kind="warning">
                    Die Papra-Quelle ist derzeit nicht verbunden. Die Verknüpfung bleibt erhalten.
                  </Notice>
                )}
                <div className="papra-actions">
                  {link.available && (
                    <DocumentFileActions
                      url={`/api/document-links/${link.id}/file?propertyId=${propertyId}`}
                      pdf={link.mimeType === 'application/pdf'}
                      onError={setError}
                    />
                  )}
                  <a
                    className="btn btn-secondary"
                    href={link.papraUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    In Papra öffnen
                  </a>
                  <button
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      setError('');
                      void deleteJson(`/api/document-links/${link.id}?propertyId=${propertyId}`)
                        .then(load)
                        .catch((reason: unknown) =>
                          setError(
                            reason instanceof Error ? reason.message : 'Entfernen fehlgeschlagen.',
                          ),
                        )
                        .finally(() => setBusy(false));
                    }}
                  >
                    Verknüpfung entfernen
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="form-actions">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => {
                setError('');
                setPicker(true);
              }}
            >
              Aus Papra auswählen
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
