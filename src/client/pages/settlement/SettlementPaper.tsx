import { dateDe, euro } from '../../format';
import type { SettlementPreview } from '../../types';
import { createTenantStatementGroups } from './settlement-groups';

type SettlementPaperProps = {
  preview: SettlementPreview;
};

function prepaymentLabel(group: string): string {
  if (group === 'Wohnung') return 'Nebenkosten Wohnung';
  if (group === 'Garage') return 'Garage';
  return group;
}

function getPrepaymentEntries(preview: SettlementPreview): Array<[string, number]> {
  const dynamicEntries = Object.entries(preview.prepaymentsByGroup ?? {}).filter(
    ([, amount]) => amount !== 0,
  );
  if (dynamicEntries.length > 0) return dynamicEntries;
  return [
    ['Wohnung', preview.utilityPrepayments],
    ['Garage', preview.garagePrepayments],
  ].filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] !== 0);
}

export default function SettlementPaper({ preview }: SettlementPaperProps) {
  const groups = createTenantStatementGroups(preview.rows);
  const prepaymentEntries = getPrepaymentEntries(preview);

  return (
    <article className="settlement-paper">
      <div className="address-grid">
        <address>
          <small>Vermieter</small>
          <strong>{preview.landlordName}</strong>
          <span>{preview.landlordAddress}</span>
        </address>
        <address>
          <small>Empfänger</small>
          <strong>{preview.tenantName}</strong>
          <span>{preview.tenantAddress}</span>
        </address>
      </div>

      <header className="document-title">
        <div>
          <p>Betriebskostenabrechnung</p>
          <h2>
            {preview.year} · {preview.unitName}
          </h2>
        </div>
        <dl className="document-meta">
          <div>
            <dt>Objekt</dt>
            <dd>
              {preview.propertyName}
              <br />
              {preview.propertyAddress}
            </dd>
          </div>
          <div>
            <dt>Abrechnungszeitraum</dt>
            <dd>
              {dateDe(preview.periodStart)} bis {dateDe(preview.periodEnd)} · {preview.days} Tage
              {preview.isPartialYear ? ' · zeitanteilig' : ''}
            </dd>
          </div>
        </dl>
      </header>

      {preview.blockingReasons.length > 0 && (
        <div className="print-warnings print-blocking">
          <strong>Offene Prüfpunkte</strong>
          {preview.blockingReasons.map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
        </div>
      )}
      {preview.warnings.length > 0 && (
        <div className="print-warnings">
          {preview.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}
      {preview.notes.length > 0 && (
        <div className="print-notes">
          <strong>Hinweise zur Berechnung</strong>
          <ul>
            {preview.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="statement-group">
        <h3>Umlagefähige Betriebskosten</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sammelposition</th>
                <th className="number-cell">Original gesamt</th>
                <th className="number-cell">Umlagefähig</th>
                <th className="number-cell">Ihr Anteil</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.name}>
                  <td>
                    <strong>{group.name}</strong>
                    {group.allocationLabels.length > 0 && (
                      <small>
                        {group.isLegacyRounding ? 'Altdaten: ' : 'Verteilung: '}
                        {group.allocationLabels.join(' · ')}
                      </small>
                    )}
                  </td>
                  <td className="number-cell">{euro(group.sourceAmount)}</td>
                  <td className="number-cell">{euro(group.allocableAmount)}</td>
                  <td className="number-cell">
                    <strong>{euro(group.tenantShare)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Gesamt</td>
                <td className="number-cell">
                  {euro(groups.reduce((sum, group) => sum + group.sourceAmount, 0))}
                </td>
                <td className="number-cell">
                  {euro(groups.reduce((sum, group) => sum + group.allocableAmount, 0))}
                </td>
                <td className="number-cell">
                  <strong>{euro(preview.totalTenantShare)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="prepayment-explanation">
        <h3>Tatsächlich geleistete Betriebskostenvorauszahlungen</h3>
        <p>
          Berücksichtigt werden ausschließlich die im Mietkonto als bezahlt erfassten Anteile –
          nicht das vertragliche Soll.
        </p>
        {prepaymentEntries.length > 0 ? (
          prepaymentEntries.map(([group, amount]) => (
            <div key={group}>
              <span>{prepaymentLabel(group)}</span>
              <strong>{euro(amount)}</strong>
            </div>
          ))
        ) : (
          <div>
            <span>Keine tatsächlichen Vorauszahlungen erfasst</span>
            <strong>{euro(0)}</strong>
          </div>
        )}
      </section>

      <section className="settlement-total">
        <div>
          <span>Ihr Kostenanteil</span>
          <strong>{euro(preview.totalTenantShare)}</strong>
        </div>
        <div>
          <span>Tatsächliche Vorauszahlungen</span>
          <strong>− {euro(preview.totalPrepayments)}</strong>
        </div>
        <div className={preview.balance > 0 ? 'balance-due' : 'balance-credit'}>
          <span>
            {preview.balance > 0
              ? 'Nachzahlung'
              : preview.balance < 0
                ? 'Guthaben'
                : 'Ausgeglichen'}
          </span>
          <strong>{euro(Math.abs(preview.balance))}</strong>
        </div>
      </section>

      {preview.labor35a > 0 && (
        <section className="tax-note">
          <strong>Bescheinigung nach §35a EStG</strong>
          <p>
            Der auf dieses Mietverhältnis entfallende, begünstigte Arbeitskostenanteil beträgt{' '}
            {euro(preview.labor35a)}.
          </p>
        </section>
      )}

      <section className="payment-request">
        {preview.balance > 0 ? (
          <p>
            Bitte überweisen Sie die Nachzahlung von <strong>{euro(preview.balance)}</strong>{' '}
            innerhalb von {preview.paymentDeadlineDays} Tagen nach Zugang dieser Abrechnung.
          </p>
        ) : preview.balance < 0 ? (
          <p>
            Das Guthaben von <strong>{euro(Math.abs(preview.balance))}</strong> wird mit Ihnen
            ausgeglichen.
          </p>
        ) : (
          <p>Aus dieser Abrechnung ergibt sich keine Zahlung.</p>
        )}
        <dl>
          <div>
            <dt>Kontoinhaber</dt>
            <dd>{preview.bankAccountHolder}</dd>
          </div>
          <div>
            <dt>IBAN</dt>
            <dd>{preview.bankIban}</dd>
          </div>
          <div>
            <dt>Zahlungsfrist</dt>
            <dd>{preview.paymentDeadlineDays} Tage nach Zugang</dd>
          </div>
        </dl>
      </section>

      <footer className="letter-footer">
        <p>
          Bitte prüfen Sie die Abrechnung. Rückfragen richten Sie an den oben genannten Vermieter.
        </p>
      </footer>
    </article>
  );
}
