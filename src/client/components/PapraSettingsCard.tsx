import { useEffect, useState } from 'react';
import type { PapraSettings } from '../../shared/papra';
import { getJson, postJson, putJson } from '../api';
import { ErrorBox, Loading, Notice } from './Common';

export default function PapraSettingsCard() {
  const [settings, setSettings] = useState<PapraSettings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [clearApiKey, setClearApiKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function load() {
    try {
      setSettings(await getJson<PapraSettings>('/api/papra/settings'));
      setError('');
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Papra-Einstellungen konnten nicht geladen werden.',
      );
    }
  }
  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);
  async function save(test: boolean) {
    if (!settings) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const saved = await putJson<PapraSettings>('/api/papra/settings', {
        baseUrl: settings.baseUrl,
        publicUrl: settings.publicUrl,
        revision: settings.revision,
        apiKey: apiKey.trim() || undefined,
        clearApiKey,
      });
      setSettings(saved);
      setApiKey('');
      setClearApiKey(false);
      if (test) {
        const result = await postJson<PapraSettings & { message: string }>('/api/papra/test', {
          revision: saved.revision,
        });
        setSettings(result);
        setMessage(result.message);
      } else setMessage('Papra-Einstellungen gespeichert. Bitte die Verbindung prüfen.');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Papra konnte nicht eingerichtet werden.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card" aria-label="Papra-Einstellungen">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Dokumente & Belege</p>
          <h2>Papra</h2>
        </div>
      </div>
      <p className="section-copy">
        PDFs direkt scannen und Originale mit Kosten oder Häusern verknüpfen. Die Dateien bleiben in
        Papra. Die Organisation wählst du beim jeweiligen Haus unter „Dokumente“.
      </p>
      {error && <ErrorBox message={error} onRetry={() => void load()} />}
      {message && <Notice kind="success">{message}</Notice>}
      {!settings && !error && <Loading />}
      {settings && (
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void save(false);
          }}
        >
          <label className="field span-2">
            Papra-Adresse
            <input
              type="url"
              value={settings.baseUrl}
              placeholder="https://papra.example.org"
              disabled={busy}
              onChange={(event) =>
                setSettings({ ...settings, baseUrl: event.target.value, connected: false })
              }
            />
          </label>
          <label className="field span-2">
            Papra-Adresse im Browser (optional)
            <input
              type="url"
              aria-label="Papra-Adresse im Browser"
              value={settings.publicUrl}
              disabled={busy}
              placeholder="z. B. https://papra.example.org"
              onChange={(event) => setSettings({ ...settings, publicUrl: event.target.value })}
            />
            <small>
              Bei interner Docker-Adresse hier die LAN- oder Web-Adresse für „In Papra öffnen“
              eintragen. Leer übernimmt die Papra-Adresse.
            </small>
          </label>
          <label className="field span-2">
            Papra-API-Schlüssel
            <input
              type="password"
              aria-label="Papra-API-Schlüssel"
              autoComplete="new-password"
              value={apiKey}
              disabled={busy}
              placeholder={
                settings.apiKeyConfigured
                  ? 'Schlüssel gespeichert · leer lassen zum Beibehalten'
                  : 'API-Schlüssel eintragen'
              }
              onChange={(event) => {
                setApiKey(event.target.value);
                setClearApiKey(false);
              }}
            />
            <small>
              In Papra unter API-Schlüssel die Leserechte für Organisationen und Dokumente
              auswählen. Bei einer neuen Serveradresse den Schlüssel erneut eintragen.
            </small>
          </label>
          {settings.apiKeyConfigured && (
            <label className="check-field span-2">
              <input
                type="checkbox"
                checked={clearApiKey}
                disabled={busy}
                onChange={(event) => setClearApiKey(event.target.checked)}
              />
              Papra-Schlüssel beim Speichern löschen
            </label>
          )}
          <p className="span-2" role="status">
            {settings.connected ? 'Verbindung geprüft' : 'Verbindung noch nicht geprüft'}
          </p>
          <div className="form-actions span-2">
            <button className="btn btn-secondary" type="submit" disabled={busy}>
              Papra speichern
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy || !settings.baseUrl}
              onClick={() => void save(true)}
            >
              {busy ? 'Prüft …' : 'Verbindung prüfen'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
