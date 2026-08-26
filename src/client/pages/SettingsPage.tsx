import { useEffect, useRef, useState } from 'react';
import { downloadBackup, getJson, importBackup, putJson } from '../api';
import { ErrorBox, Loading, Notice, PageHeader } from '../components/Common';
import type { Settings } from '../types';

export default function SettingsPage({ reload }: { reload: () => Promise<void> }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setError('');
    try {
      setSettings(await getJson<Settings>('/api/settings'));
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

  async function restore(file: File) {
    if (
      !window.confirm(
        'Das Backup ersetzt den aktuellen Datenbestand vollständig. Vorher solltest du ein frisches Export-Backup speichern. Fortfahren?',
      )
    )
      return;
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
      {!settings && !error && <Loading />}

      {settings && (
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
