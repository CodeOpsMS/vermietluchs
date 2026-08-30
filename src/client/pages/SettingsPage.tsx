import { useEffect, useRef, useState } from 'react';
import { downloadBackup, getJson, importBackup, postJson, putJson } from '../api';
import { AI_PROVIDER_DEFAULTS } from '../../shared/ai';
import { ErrorBox, Loading, Notice, PageHeader } from '../components/Common';
import type { AiProvider, AiSettings, Settings } from '../types';

export default function SettingsPage({ reload }: { reload: () => Promise<void> }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [clearApiKey, setClearApiKey] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setError('');
    try {
      const [loadedSettings, loadedAiSettings] = await Promise.all([
        getJson<Settings>('/api/settings'),
        getJson<AiSettings>('/api/ai/settings'),
      ]);
      setSettings(loadedSettings);
      setAiSettings(loadedAiSettings);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Einstellungen konnten nicht geladen werden.',
      );
    }
  }
  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);

  async function save() {
    if (!settings) return;
    if (settings.paymentDeadlineDays < 1 || settings.paymentDeadlineDays > 365)
      return setError('Die Zahlungsfrist muss zwischen 1 und 365 Tagen liegen.');
    setBusy(true);
    setError('');
    setMessage('');
    try {
      setSettings(await putJson<Settings>('/api/settings', settings));
      setMessage('Einstellungen gespeichert.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  async function saveAi(testAfterSave = false) {
    if (!aiSettings) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const saved = await putJson<AiSettings>('/api/ai/settings', {
        enabled: aiSettings.enabled,
        provider: aiSettings.provider,
        model: aiSettings.model,
        baseUrl: aiSettings.baseUrl,
        apiKey: apiKey.trim() || undefined,
        clearApiKey,
        revision: aiSettings.revision,
      });
      setAiSettings(saved);
      setApiKey('');
      setClearApiKey(false);
      await reload();
      if (testAfterSave) {
        const result = await postJson<{ ok: true; message: string }>('/api/ai/test', {
          provider: saved.provider,
          model: saved.model,
          baseUrl: saved.baseUrl,
        });
        setMessage(result.message);
      } else {
        setMessage('KI-Einstellungen gespeichert.');
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'KI-Einstellungen konnten nicht gespeichert werden.',
      );
    } finally {
      setBusy(false);
    }
  }

  function selectProvider(provider: AiProvider) {
    if (!aiSettings) return;
    const defaults = AI_PROVIDER_DEFAULTS[provider];
    setAiSettings({
      ...aiSettings,
      provider,
      model: defaults.model,
      baseUrl: defaults.baseUrl,
      apiKeyConfigured: false,
    });
    setApiKey('');
    setClearApiKey(false);
  }

  async function restore(file: File) {
    if (
      !window.confirm(
        'Das Backup ersetzt den aktuellen Datenbestand vollständig. Vorher solltest du ein frisches Export-Backup speichern. Fortfahren?',
      )
    ) {
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await importBackup(file);
      await reload();
      await load();
      setMessage('Backup erfolgreich eingespielt.');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Backup konnte nicht eingespielt werden.',
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <>
      <PageHeader
        title="Einstellungen & Backup"
        subtitle="Absender, Zahlungsdaten und die Sicherung deines vollständigen lokalen Datenbestands."
      />
      {error && <ErrorBox message={error} onRetry={() => void load()} />}
      {message && <Notice kind="success">{message}</Notice>}
      {(!settings || !aiSettings) && !error && <Loading />}

      {settings && aiSettings && (
        <div className="settings-grid">
          <section className="card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Standard-Absender</p>
                <h2>Vermieterdaten</h2>
              </div>
            </div>
            <p className="section-copy">
              Diese Angaben gelten als Vorgabe. Bei Bedarf können Häuser später eigene Angaben
              überschreiben. Bereits abgeschlossene Abrechnungen behalten ihren damaligen Absender;
              sie müssen für eine Änderung ausdrücklich zur Korrektur geöffnet werden.
            </p>
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <label className="field span-2">
                Name
                <input
                  value={settings.landlordName}
                  onChange={(e) => setSettings({ ...settings, landlordName: e.target.value })}
                  placeholder="Vor- und Nachname"
                />
              </label>
              <label className="field span-2">
                Anschrift
                <textarea
                  rows={3}
                  value={settings.landlordAddress}
                  onChange={(e) => setSettings({ ...settings, landlordAddress: e.target.value })}
                  placeholder="Straße, PLZ Ort"
                />
              </label>
              <label className="field span-2">
                Kontoinhaber
                <input
                  value={settings.bankAccountHolder}
                  onChange={(e) => setSettings({ ...settings, bankAccountHolder: e.target.value })}
                />
              </label>
              <label className="field span-2">
                IBAN
                <input
                  value={settings.bankIban}
                  onChange={(e) =>
                    setSettings({ ...settings, bankIban: e.target.value.toUpperCase() })
                  }
                  placeholder="DE00 0000 0000 0000 0000 00"
                />
              </label>
              <label className="field">
                Zahlungsfrist in Tagen
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={settings.paymentDeadlineDays}
                  onChange={(e) =>
                    setSettings({ ...settings, paymentDeadlineDays: Number(e.target.value) })
                  }
                />
              </label>
              <div className="form-actions span-2">
                <button className="btn btn-primary" disabled={busy} type="submit">
                  {busy ? 'Speichert …' : 'Einstellungen speichern'}
                </button>
              </div>
            </form>
          </section>

          <div className="settings-side">
            <section className="card ai-settings-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Optional · KI-Unterstützung</p>
                  <h2>KI-Scan</h2>
                </div>
                <label className="toggle-field">
                  <input
                    type="checkbox"
                    aria-label="KI-Scan aktivieren"
                    checked={aiSettings.enabled}
                    onChange={(event) =>
                      setAiSettings({ ...aiSettings, enabled: event.target.checked })
                    }
                  />
                  <span>{aiSettings.enabled ? 'Aktiv' : 'Aus'}</span>
                </label>
              </div>
              <p className="section-copy">
                Liest Kosten und Zählerstände aus PDFs als prüfbaren Entwurf. Mieter,
                Mietverhältnisse und Abrechnungen werden nie durch die KI angelegt.
              </p>
              <form
                className="form-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveAi(false);
                }}
              >
                <label className="field span-2">
                  Anbieter
                  <select
                    value={aiSettings.provider}
                    onChange={(event) => selectProvider(event.target.value as AiProvider)}
                  >
                    <option value="ollama">Ollama · lokal</option>
                    <option value="openai">OpenAI</option>
                    <option value="mistral">Mistral / Mixtral</option>
                  </select>
                </label>
                <label className="field span-2">
                  Modell
                  <input
                    value={aiSettings.model}
                    onChange={(event) =>
                      setAiSettings({ ...aiSettings, model: event.target.value })
                    }
                    placeholder={AI_PROVIDER_DEFAULTS[aiSettings.provider].model}
                  />
                </label>
                <label className="field span-2">
                  API-Adresse
                  <input
                    value={aiSettings.baseUrl}
                    readOnly={aiSettings.provider !== 'ollama'}
                    onChange={(event) =>
                      setAiSettings({ ...aiSettings, baseUrl: event.target.value })
                    }
                  />
                  <small>
                    {aiSettings.provider === 'ollama'
                      ? 'Im Docker-Container meist http://host.docker.internal:11434 oder eine private LAN-IP.'
                      : 'Cloud-Endpunkte sind zum Schutz von Schlüssel und PDF fest vorgegeben.'}
                  </small>
                </label>
                {aiSettings.provider !== 'ollama' && (
                  <label className="field span-2">
                    API-Schlüssel
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={apiKey}
                      onChange={(event) => {
                        setApiKey(event.target.value);
                        if (event.target.value) setClearApiKey(false);
                      }}
                      placeholder={
                        aiSettings.apiKeyConfigured
                          ? 'Schlüssel gespeichert · leer lassen zum Beibehalten'
                          : 'API-Schlüssel eintragen'
                      }
                    />
                    <small>
                      Separat mit Dateirechten 0600 gespeichert; nicht in SQLite, API-Antworten oder
                      JSON-Backups enthalten.
                    </small>
                  </label>
                )}
                {aiSettings.provider !== 'ollama' && aiSettings.apiKeyConfigured && (
                  <label className="check-field span-2">
                    <input
                      type="checkbox"
                      checked={clearApiKey}
                      onChange={(event) => setClearApiKey(event.target.checked)}
                    />
                    Gespeicherten Schlüssel beim Speichern löschen
                  </label>
                )}
                <div className="ai-privacy-note span-2">
                  {aiSettings.provider === 'ollama' ? (
                    <>
                      <strong>Lokale Verarbeitung:</strong> PDF-Inhalt bleibt bei deiner
                      Ollama-Instanz.
                    </>
                  ) : (
                    <>
                      <strong>Cloud-Verarbeitung:</strong> PDFs werden zur Analyse an den gewählten
                      Anbieter übertragen. Dessen Datenschutz- und Aufbewahrungsregeln gelten.
                    </>
                  )}
                </div>
                <div className="form-actions span-2 ai-settings-actions">
                  <button
                    className="btn btn-secondary"
                    disabled={busy}
                    type="button"
                    onClick={() => void saveAi(true)}
                  >
                    {busy ? 'Prüft …' : 'Speichern & Verbindung testen'}
                  </button>
                  <button className="btn btn-primary" disabled={busy} type="submit">
                    {busy ? 'Speichert …' : 'KI-Einstellungen speichern'}
                  </button>
                </div>
              </form>
            </section>

            <section className="card backup-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Deine Daten</p>
                  <h2>Backup</h2>
                </div>
                <span className="backup-mark">↓</span>
              </div>
              <p>
                Ein Export enthält Häuser, Wohnungen, Mietverhältnisse, Kosten, Zähler, Zahlungen,
                Einstellungen und abgeschlossene Abrechnungen.
              </p>
              <button
                className="btn btn-primary full-width"
                disabled={busy}
                onClick={() => {
                  setError('');
                  void downloadBackup().catch((reason: unknown) =>
                    setError(reason instanceof Error ? reason.message : 'Export fehlgeschlagen.'),
                  );
                }}
              >
                JSON-Backup herunterladen
              </button>
              <div className="divider">
                <span>oder</span>
              </div>
              <input
                ref={fileRef}
                className="file-input"
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void restore(file);
                }}
              />
              <button
                className="btn btn-secondary full-width"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                Backup einspielen
              </button>
              <small>
                Beim Import wird Format und Versionsnummer geprüft. Bewahre Backups zusätzlich auf
                einem anderen Datenträger auf.
              </small>
            </section>

            <section className="security-card">
              <div className="security-icon" aria-hidden="true">
                !
              </div>
              <div>
                <p className="eyebrow">Wichtiger Sicherheitshinweis</p>
                <h2>Nicht ungeschützt im LAN freigeben</h2>
                <p>
                  Vermietluchs enthält Namen, Adressen, Zahlungs- und Abrechnungsdaten.
                  Standardmäßig darf der Server nur auf <code>127.0.0.1</code> erreichbar sein.
                </p>
                <p>
                  Wenn du ihn bewusst für dein Heimnetz öffnest, können Geräte im selben Netz ohne
                  zusätzliche Anmeldung auf die Daten zugreifen. Nutze eine LAN-Freigabe deshalb nur
                  in einem vertrauenswürdigen Netz und niemals durch eine Router-Portfreigabe ins
                  Internet.
                </p>
              </div>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
