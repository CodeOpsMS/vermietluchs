import { useEffect, useState } from 'react';
import type {
  PapraDocument,
  PapraDocumentPage,
  PapraMapping,
  PapraOrganization,
  PapraSelection,
} from '../../shared/papra';
import { api, getJson, putJson } from '../api';
import { ErrorBox, Loading, Notice } from './Common';

export type SelectedPapraDocument = { document: PapraDocument; selection: PapraSelection };
function papraFileUrl(propertyId: number, selection: PapraSelection) {
  return `/api/properties/${propertyId}/papra/file?${new URLSearchParams(Object.entries(selection).map(([key, value]) => [key, String(value)]))}`;
}
export function DocumentFileActions({
  url,
  pdf,
  onError,
}: {
  url: string;
  pdf: boolean;
  onError: (message: string) => void;
}) {
  async function open(event: React.MouseEvent<HTMLAnchorElement>, download: boolean) {
    event.preventDefault();
    const popup = download ? null : window.open('', '_blank');
    if (popup) popup.opener = null;
    try {
      await getJson(`${url}&check=1`);
      if (download) {
        const anchor = document.createElement('a');
        anchor.href = `${url}&download=1`;
        anchor.download = '';
        anchor.click();
      } else if (popup) popup.location.href = url;
      else throw new Error('Bitte das Öffnen eines neuen Tabs für Vermietluchs erlauben.');
    } catch (reason) {
      popup?.close();
      onError(
        reason instanceof Error ? reason.message : 'Das Dokument konnte nicht geöffnet werden.',
      );
    }
  }
  return (
    <span className="papra-actions">
      {pdf && (
        <a
          className="btn btn-secondary"
          href={url}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => void open(event, false)}
        >
          PDF öffnen
        </a>
      )}
      <a
        className="btn btn-secondary"
        href={`${url}&download=1`}
        download
        onClick={(event) => void open(event, true)}
      >
        Herunterladen
      </a>
    </span>
  );
}

export function PapraDocumentPicker({
  propertyId,
  pdfOnly = false,
  onSelect,
  onCancel,
}: {
  propertyId: number;
  pdfOnly?: boolean;
  onSelect: (selected: SelectedPapraDocument) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState({ search: '', page: 0, retry: 0 });
  const [result, setResult] = useState<PapraDocumentPage | null>(null);
  const [busy, setBusy] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setBusy(true);
      setError('');
      setResult(null);
      try {
        const page = await api<PapraDocumentPage>(
          `/api/properties/${propertyId}/papra/documents?${new URLSearchParams({ search: query.search, page: String(query.page) })}`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) setResult(page);
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : 'Papra-Dokumente konnten nicht geladen werden.',
          );
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    });
    return () => controller.abort();
  }, [propertyId, query]);
  return (
    <div className="papra-documents">
      <p>Dokumente der diesem Haus zugeordneten Papra-Organisation. Originale bleiben in Papra.</p>
      <form
        className="papra-search"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery({ search, page: 0, retry: query.retry + 1 });
        }}
      >
        <label className="field">
          Dokumente suchen
          <input
            value={search}
            maxLength={1024}
            placeholder="Suchbegriff oder tag:Rechnung"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <button className="btn btn-secondary" disabled={selecting}>
          Suchen
        </button>
      </form>
      {error && (
        <ErrorBox message={error} onRetry={() => setQuery({ ...query, retry: query.retry + 1 })} />
      )}
      {busy && <Loading label="Papra-Dokumente werden geladen …" />}
      {result && (
        <>
          <p role="status">
            {result.documentsCount} Dokumente · Seite {query.page + 1}
          </p>
          {result.documents.length === 0 && <Notice>Keine Dokumente gefunden.</Notice>}
          <ul className="papra-list">
            {result.documents.map((document) => {
              const selection: PapraSelection = {
                documentId: document.id,
                organizationId: result.organizationId,
                settingsRevision: result.settingsRevision,
                mappingRevision: result.mappingRevision,
              };
              const canSelect =
                !pdfOnly ||
                (document.mimeType === 'application/pdf' &&
                  document.originalSize <= 20 * 1024 * 1024);
              return (
                <li key={document.id}>
                  <div>
                    <strong>{document.name}</strong>
                    <small>
                      {document.originalName} · {(document.originalSize / 1024).toFixed(1)} KiB ·{' '}
                      {document.mimeType}
                    </small>
                  </div>
                  <div className="papra-actions">
                    <DocumentFileActions
                      url={papraFileUrl(propertyId, selection)}
                      pdf={document.mimeType === 'application/pdf'}
                      onError={setError}
                    />
                    <button
                      className="btn btn-primary"
                      disabled={!canSelect || selecting}
                      onClick={() => {
                        setSelecting(true);
                        setError('');
                        void Promise.resolve()
                          .then(async () => {
                            // Die KI-Auswahl vorab prüfen und mit Dokument-ID protokollieren.
                            if (pdfOnly)
                              await getJson(`${papraFileUrl(propertyId, selection)}&check=1`);
                            await onSelect({ document, selection });
                          })
                          .catch((reason: unknown) =>
                            setError(
                              reason instanceof Error ? reason.message : 'Auswahl fehlgeschlagen.',
                            ),
                          )
                          .finally(() => setSelecting(false));
                      }}
                    >
                      {pdfOnly ? 'Für KI-Scan auswählen' : 'Verknüpfen'}
                    </button>
                  </div>
                  {!canSelect && <small>Für den KI-Scan sind PDFs bis 20 MiB geeignet.</small>}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div className="form-actions">
        <button className="btn btn-secondary" disabled={selecting} onClick={onCancel}>
          Zurück
        </button>
        <button
          className="btn btn-secondary"
          disabled={busy || selecting || query.page === 0}
          onClick={() => setQuery({ ...query, page: query.page - 1 })}
        >
          Vorherige Seite
        </button>
        <button
          className="btn btn-secondary"
          disabled={busy || selecting || !result || (query.page + 1) * 20 >= result.documentsCount}
          onClick={() => setQuery({ ...query, page: query.page + 1 })}
        >
          Nächste Seite
        </button>
      </div>
    </div>
  );
}

export function PapraOrganizationMapping({ propertyId }: { propertyId: number }) {
  const [mapping, setMapping] = useState<PapraMapping | null>(null);
  const [organizations, setOrganizations] = useState<PapraOrganization[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError('');
    try {
      const [assigned, accessible] = await Promise.all([
        getJson<PapraMapping>(`/api/properties/${propertyId}/papra`),
        getJson<{ organizations: PapraOrganization[] }>('/api/papra/organizations'),
      ]);
      setMapping(assigned);
      setOrganizationId(assigned.organizationId ?? '');
      setOrganizations(accessible.organizations);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Organisationen konnten nicht geladen werden.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!mapping) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const saved = await putJson<PapraMapping>(`/api/properties/${propertyId}/papra`, {
        organizationId: organizationId || null,
        revision: mapping.revision,
      });
      setMapping(saved);
      setMessage(
        'Organisation für dieses Haus gespeichert. Vorhandene Belege behalten ihre Quelle.',
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Zuordnung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="papra-mapping">
      <summary>Papra-Organisation für dieses Haus</summary>
      <p>Neue Dokumente werden aus dieser Organisation ausgewählt.</p>
      {error && <ErrorBox message={error} />}
      {message && <Notice kind="success">{message}</Notice>}
      <button className="btn btn-secondary" disabled={busy} onClick={() => void load()}>
        Organisationen laden
      </button>
      {mapping && (
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="field span-2">
            Papra-Organisation
            <select
              value={organizationId}
              disabled={busy}
              onChange={(event) => setOrganizationId(event.target.value)}
            >
              <option value="">Keine Zuordnung</option>
              {mapping.organizationId &&
                !organizations.some((org) => org.id === mapping.organizationId) && (
                  <option value={mapping.organizationId}>
                    Bisherige Organisation (nicht erreichbar)
                  </option>
                )}
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions span-2">
            <button className="btn btn-primary" disabled={busy}>
              Organisation speichern
            </button>
          </div>
        </form>
      )}
    </details>
  );
}
