import { useMemo, useRef, useState } from 'react';
import type { PageProps } from '../App';
import { postJson } from '../api';
import {
  EmptyState,
  ErrorBox,
  Loading,
  Notice,
  PageHeader,
  StatusPill,
} from '../components/Common';
import { euro } from '../format';
import type {
  AiImportRequest,
  AiScanCost,
  AiScanReading,
  AiScanResponse,
  AiSettings,
} from '../types';

type CostDraft = AiScanCost & { selected: boolean };
type ReadingDraft = AiScanReading & { selected: boolean; meterId: string };

const providerLabel = { openai: 'OpenAI', mistral: 'Mistral / Mixtral', ollama: 'Ollama' } as const;
const allocationLabel = {
  area: 'Wohnfläche',
  persons: 'Personen',
  units: 'Wohneinheiten',
  meter: 'Verbrauch',
} as const;
const meterTypeLabel = {
  heating: 'Heizung',
  hotWater: 'Warmwasser',
  coldWater: 'Kaltwasser',
  other: 'Sonstiger Zähler',
} as const;

function normalizeMeter(value: string | null): string {
  return (value ?? '').toLocaleLowerCase('de-DE').replace(/[^a-z0-9]/g, '');
}

function fileToBase64(file: File): Promise<string> {
  return file.arrayBuffer().then((arrayBuffer) => {
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32_768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
    }
    return btoa(binary);
  });
}

export default function AiScanPage({
  data,
  propertyId,
  year,
  reload,
  aiSettings,
}: PageProps & { aiSettings: AiSettings }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [response, setResponse] = useState<AiScanResponse | null>(null);
  const [costs, setCosts] = useState<CostDraft[]>([]);
  const [readings, setReadings] = useState<ReadingDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const selectedProperty = data.properties.find((property) => property.id === propertyId);
  const existingCostKeys = useMemo(
    () =>
      new Set(
        data.costs
          .filter((cost) => cost.year === year)
          .map(
            (cost) =>
              `${cost.descriptionInternal.trim().toLocaleLowerCase('de-DE')}|${cost.sourceAmount.toFixed(2)}`,
          ),
      ),
    [data.costs, year],
  );
  const existingReadingKeys = useMemo(
    () => new Set(data.readings.map((reading) => `${reading.meterId}|${reading.date}`)),
    [data.readings],
  );

  function chooseFile(next: File | null) {
    setError('');
    setMessage('');
    setResponse(null);
    setCosts([]);
    setReadings([]);
    if (!next) return setFile(null);
    if (!next.name.toLocaleLowerCase('de-DE').endsWith('.pdf')) {
      setFile(null);
      setError('Bitte wähle eine PDF-Datei aus.');
      return;
    }
    if (next.size > 20 * 1024 * 1024) {
      setFile(null);
      setError('Das PDF darf höchstens 20 MB groß sein.');
      return;
    }
    setFile(next);
  }

  function matchMeter(reading: AiScanReading): string {
    const number = normalizeMeter(reading.meterNumber);
    const name = normalizeMeter(reading.meterName);
    const matches = data.meters.filter(
      (meter) =>
        (number && normalizeMeter(meter.meterNumber) === number) ||
        (!number && name && normalizeMeter(meter.name) === name),
    );
    return matches.length === 1 ? String(matches[0].id) : '';
  }

  async function scan() {
    if (!file || !propertyId) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await postJson<AiScanResponse>('/api/ai/scan', {
        propertyId,
        year,
        fileName: file.name,
        mimeType: 'application/pdf',
        dataBase64: await fileToBase64(file),
      });
      setResponse(result);
      setCosts(
        result.costs.map((cost) => ({
          ...cost,
          selected: !existingCostKeys.has(
            `${cost.description.trim().toLocaleLowerCase('de-DE')}|${cost.amount.toFixed(2)}`,
          ),
        })),
      );
      setReadings(
        result.readings.map((reading) => {
          const meterId = matchMeter(reading);
          return {
            ...reading,
            meterId,
            selected: Boolean(
              meterId &&
              reading.date &&
              reading.value !== null &&
              !existingReadingKeys.has(`${meterId}|${reading.date}`),
            ),
          };
        }),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Der PDF-Scan ist fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  async function applyProposal() {
    if (!propertyId) return;
    const selectedCosts = costs.filter((cost) => cost.selected);
    const selectedReadings = readings.filter((reading) => reading.selected);
    if (selectedCosts.length + selectedReadings.length === 0) {
      setError('Wähle mindestens einen Kostenposten oder Zählerstand aus.');
      return;
    }
    if (
      selectedReadings.some(
        (reading) => !reading.meterId || !reading.date || reading.value === null,
      )
    ) {
      setError('Jeder ausgewählte Zählerstand braucht einen Zähler, ein Datum und einen Wert.');
      return;
    }

    const body: AiImportRequest = {
      propertyId,
      year,
      fileName: response?.fileName ?? file?.name ?? 'KI-Scan.pdf',
      costs: selectedCosts.map((cost) => ({
        description: cost.description,
        amount: cost.amount,
        statementGroup: cost.statementGroup,
        allocationKey: cost.allocationKey,
        meterType: cost.allocationKey === 'meter' ? cost.meterType : null,
        labor35a: cost.labor35a,
        source: cost.source,
      })),
      readings: selectedReadings.map((reading) => ({
        meterId: Number(reading.meterId),
        date: reading.date!,
        value: reading.value!,
        source: reading.source,
      })),
    };

    setBusy(true);
    setError('');
    try {
      const imported = await postJson<{ costsCreated: number; readingsCreated: number }>(
        '/api/ai/import',
        body,
      );
      await reload();
      setMessage(
        `${imported.costsCreated} Kostenposition(en) und ${imported.readingsCreated} Zählerstand/-stände wurden übernommen. Kosten bleiben bis zur fachlichen Entscheidung als „offen“ markiert.`,
      );
      setResponse(null);
      setCosts([]);
      setReadings([]);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Der Entwurf konnte nicht übernommen werden.',
      );
    } finally {
      setBusy(false);
    }
  }

  const cloudProvider = aiSettings.provider !== 'ollama';

  return (
    <>
      <PageHeader
        title={`KI-Scan ${year}`}
        subtitle="PDFs aus Eigentümerabrechnungen, Rechnungen und Zählernachweisen als prüfbaren Entwurf einlesen."
      />
      {error && <ErrorBox message={error} />}
      {message && <Notice kind="success">{message}</Notice>}
      {!propertyId && <Notice kind="warning">Bitte zuerst ein Haus anlegen oder auswählen.</Notice>}
      {cloudProvider && (
        <Notice kind="warning">
          Dieses PDF wird zur Analyse an {providerLabel[aiSettings.provider]} übertragen. Lade nur
          Dokumente hoch, die du dort verarbeiten darfst.
        </Notice>
      )}

      <section className="card ai-upload-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Schritt 1 · Dokument</p>
            <h2>PDF auswählen</h2>
          </div>
          <StatusPill tone="navy">
            {providerLabel[aiSettings.provider]} · {aiSettings.model}
          </StatusPill>
        </div>
        <div
          className="ai-drop-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            chooseFile(event.dataTransfer.files[0] ?? null);
          }}
        >
          <span className="empty-mark" aria-hidden="true">
            ⇧
          </span>
          <strong>{file?.name ?? 'PDF hier ablegen'}</strong>
          <small>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : 'maximal 20 MB'}</small>
          <input
            ref={fileRef}
            className="file-input"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
          />
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => fileRef.current?.click()}
          >
            PDF auswählen
          </button>
        </div>
        <div className="form-actions">
          <small>
            Ziel: {selectedProperty?.name ?? 'kein Objekt'} · Abrechnungsjahr {year}
          </small>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!file || !propertyId || busy}
            onClick={() => void scan()}
          >
            {busy ? 'KI analysiert …' : 'PDF analysieren'}
          </button>
        </div>
      </section>

      {busy && <Loading label="PDF wird gelesen und von der KI ausgewertet …" />}

      {response && (
        <section className="card ai-review-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Schritt 2 · Prüfen</p>
              <h2>KI-Entwurf</h2>
            </div>
            <StatusPill tone={response.detectedYear === year ? 'good' : 'warn'}>
              erkanntes Jahr: {response.detectedYear ?? 'unklar'}
            </StatusPill>
          </div>
          <p className="section-copy">
            KI-Ergebnisse können falsch sein. Prüfe Bezeichnung, Betrag, Umlageschlüssel,
            Zählerzuordnung und Datum. Es werden weder Mieter noch Abrechnungen angelegt.
          </p>
          {response.warnings.length > 0 && (
            <Notice kind="warning">
              <ul>
                {response.warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </Notice>
          )}

          <h3>Kosten</h3>
          {costs.length === 0 ? (
            <EmptyState title="Keine Kosten erkannt">
              Das Modell hat keine eindeutigen Kostenpositionen vorgeschlagen.
            </EmptyState>
          ) : (
            <div className="ai-proposal-list">
              {costs.map((cost, index) => {
                const duplicate = existingCostKeys.has(
                  `${cost.description.trim().toLocaleLowerCase('de-DE')}|${cost.amount.toFixed(2)}`,
                );
                return (
                  <article
                    className={cost.selected ? 'selected' : ''}
                    key={`${cost.source}-${index}`}
                  >
                    <label className="ai-select-row">
                      <input
                        type="checkbox"
                        checked={cost.selected}
                        onChange={(event) =>
                          setCosts((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, selected: event.target.checked }
                                : item,
                            ),
                          )
                        }
                      />
                      <strong>{cost.description || 'Unbenannter Kostenposten'}</strong>
                      <span>{euro(cost.amount)}</span>
                    </label>
                    {duplicate && (
                      <small className="field-error">Bereits mit gleichem Betrag vorhanden.</small>
                    )}
                    <div className="form-grid compact">
                      <label className="field span-2">
                        Interne Bezeichnung
                        <input
                          value={cost.description}
                          onChange={(event) =>
                            setCosts((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, description: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        Betrag in Euro
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={cost.amount}
                          onChange={(event) =>
                            setCosts((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, amount: Number(event.target.value) }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        Ausgewiesener §35a-Anteil
                        <input
                          type="number"
                          min="0"
                          max={cost.amount}
                          step="0.01"
                          value={cost.labor35a}
                          onChange={(event) =>
                            setCosts((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, labor35a: Number(event.target.value) }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        Sammelposition
                        <select
                          value={cost.statementGroup}
                          onChange={(event) =>
                            setCosts((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      statementGroup: event.target
                                        .value as CostDraft['statementGroup'],
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          <option>Wohnung</option>
                          <option>Garage</option>
                          <option>Grundsteuer</option>
                        </select>
                      </label>
                      <label className="field">
                        Vorgeschlagener Schlüssel
                        <select
                          value={cost.allocationKey}
                          onChange={(event) =>
                            setCosts((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      allocationKey: event.target
                                        .value as CostDraft['allocationKey'],
                                      meterType:
                                        event.target.value === 'meter'
                                          ? (item.meterType ?? 'other')
                                          : null,
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          {Object.entries(allocationLabel).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {cost.allocationKey === 'meter' && (
                        <label className="field">
                          Zählerart
                          <select
                            value={cost.meterType ?? 'other'}
                            onChange={(event) =>
                              setCosts((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        meterType: event.target.value as NonNullable<
                                          CostDraft['meterType']
                                        >,
                                      }
                                    : item,
                                ),
                              )
                            }
                          >
                            {Object.entries(meterTypeLabel).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                    <footer>
                      <small>Quelle: {cost.source || 'nicht angegeben'}</small>
                      <small>Sicherheit: {Math.round(cost.confidence * 100)} %</small>
                    </footer>
                  </article>
                );
              })}
            </div>
          )}

          <h3>Zählerstände</h3>
          {readings.length === 0 ? (
            <EmptyState title="Keine Zählerstände erkannt">
              Das Modell hat keine eindeutigen Zählerstände vorgeschlagen.
            </EmptyState>
          ) : (
            <div className="ai-proposal-list">
              {readings.map((reading, index) => {
                const duplicate = Boolean(
                  reading.meterId &&
                  reading.date &&
                  existingReadingKeys.has(`${reading.meterId}|${reading.date}`),
                );
                return (
                  <article
                    className={reading.selected ? 'selected' : ''}
                    key={`${reading.source}-${index}`}
                  >
                    <label className="ai-select-row">
                      <input
                        type="checkbox"
                        checked={reading.selected}
                        onChange={(event) =>
                          setReadings((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, selected: event.target.checked }
                                : item,
                            ),
                          )
                        }
                      />
                      <strong>
                        {reading.meterNumber || reading.meterName || 'Unbekannter Zähler'}
                      </strong>
                      <span>
                        {reading.value ?? '—'} {reading.unit ?? ''}
                      </span>
                    </label>
                    {duplicate && (
                      <small className="field-error">Für dieses Datum bereits vorhanden.</small>
                    )}
                    <div className="form-grid compact">
                      <label className="field span-2">
                        Bestehender Zähler
                        <select
                          value={reading.meterId}
                          onChange={(event) =>
                            setReadings((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, meterId: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        >
                          <option value="">Bitte zuordnen</option>
                          {data.meters.map((meter) => {
                            const unit = data.units.find(
                              (candidate) => candidate.id === meter.unitId,
                            );
                            return (
                              <option key={meter.id} value={meter.id}>
                                {unit?.name ?? 'Wohnung'} · {meter.name}
                                {meter.meterNumber ? ` · ${meter.meterNumber}` : ''}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                      <label className="field">
                        Datum
                        <input
                          type="date"
                          value={reading.date ?? ''}
                          onChange={(event) =>
                            setReadings((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, date: event.target.value || null }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        Zählerstand
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={reading.value ?? ''}
                          onChange={(event) =>
                            setReadings((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      value:
                                        event.target.value === ''
                                          ? null
                                          : Number(event.target.value),
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                    </div>
                    <footer>
                      <small>Quelle: {reading.source || 'nicht angegeben'}</small>
                      <small>Sicherheit: {Math.round(reading.confidence * 100)} %</small>
                    </footer>
                  </article>
                );
              })}
            </div>
          )}

          <div className="form-actions">
            <small>Übernommene Kosten werden zur Pflichtprüfung als „offen“ angelegt.</small>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy}
              onClick={() => void applyProposal()}
            >
              Ausgewählte Daten übernehmen
            </button>
          </div>
        </section>
      )}
    </>
  );
}
