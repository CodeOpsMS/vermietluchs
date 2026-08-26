import { useEffect, useMemo, useRef, useState } from 'react';
import { DATA_CONFLICT_EVENT, getJson } from './api';
import { ErrorBox, Loading } from './components/Common';
import type { AppData, Cost, Meter, Payment, Property, Reading, Tenancy, Unit } from './types';
import CockpitPage from './pages/CockpitPage';
import PropertiesPage from './pages/PropertiesPage';
import CostsPage from './pages/CostsPage';
import MetersPage from './pages/MetersPage';
import RentPage from './pages/RentPage';
import SettlementPage from './pages/SettlementPage';
import SettingsPage from './pages/SettingsPage';

type PageId = 'cockpit' | 'properties' | 'costs' | 'meters' | 'rent' | 'settlement' | 'settings';

const NAVIGATION: { id: PageId; label: string; short: string }[] = [
  { id: 'cockpit', label: 'Cockpit', short: 'Übersicht' },
  { id: 'properties', label: 'Häuser & Wohnungen', short: 'Häuser' },
  { id: 'costs', label: 'Kosten', short: 'Kosten' },
  { id: 'meters', label: 'Zähler & Ablesungen', short: 'Zähler' },
  { id: 'rent', label: 'Mietkonto', short: 'Mietkonto' },
  { id: 'settlement', label: 'Abrechnung', short: 'Abrechnung' },
  { id: 'settings', label: 'Einstellungen', short: 'Einstellungen' },
];

const EMPTY_DATA: AppData = {
  properties: [],
  units: [],
  tenancies: [],
  costs: [],
  meters: [],
  readings: [],
  payments: [],
};

export default function App() {
  const [page, setPage] = useState<PageId>('cockpit');
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState('');
  const [scopeRevision, setScopeRevision] = useState(0);
  const loadedOnce = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [propertyId, setPropertyId] = useState<number | null>(() => {
    const value = localStorage.getItem('vermietluchs-property');
    return value ? Number(value) : null;
  });

  async function loadAll() {
    if (loadedOnce.current) setRefreshing(true);
    else setInitialLoading(true);
    setError('');
    try {
      const [properties, units, tenancies, costs, meters, readings, payments] = await Promise.all([
        getJson<Property[]>('/api/properties'),
        getJson<Unit[]>('/api/units'),
        getJson<Tenancy[]>('/api/tenancies'),
        getJson<Cost[]>('/api/costs'),
        getJson<Meter[]>('/api/meters'),
        getJson<Reading[]>('/api/readings'),
        getJson<Payment[]>('/api/payments'),
      ]);
      setData({ properties, units, tenancies, costs, meters, readings, payments });
      setHasLoaded(true);
      loadedOnce.current = true;
      setPropertyId((current) => {
        const stillExists = properties.some((property) => property.id === current);
        return stillExists ? current : (properties[0]?.id ?? null);
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Der Server ist nicht erreichbar.');
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    // Der erste Ladevorgang startet nach dem initialen Render.
    void Promise.resolve().then(loadAll);
  }, []);
  useEffect(() => {
    const handleConflict = () => {
      // Ein veraltetes Formular wird geschlossen und mit dem aktuellen Stand
      // neu aufgebaut. So überschreiben zwei Browser einander nicht unbemerkt.
      setScopeRevision((current) => current + 1);
      void loadAll();
    };
    window.addEventListener(DATA_CONFLICT_EVENT, handleConflict);
    return () => window.removeEventListener(DATA_CONFLICT_EVENT, handleConflict);
  }, []);
  useEffect(() => {
    if (propertyId) localStorage.setItem('vermietluchs-property', String(propertyId));
    else localStorage.removeItem('vermietluchs-property');
  }, [propertyId]);

  const selectedProperty = data.properties.find((property) => property.id === propertyId) ?? null;
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = new Set<number>();
    const addYear = (value: string | number | null | undefined) => {
      const parsed = typeof value === 'number' ? value : Number(String(value ?? '').slice(0, 4));
      if (Number.isInteger(parsed) && parsed >= 1900 && parsed <= 3000) years.add(parsed);
    };

    for (let value = 2012; value <= currentYear + 1; value += 1) years.add(value);
    data.costs.forEach((cost) => addYear(cost.year));
    data.payments.forEach((payment) => addYear(payment.dueDate));
    data.readings.forEach((reading) => addYear(reading.date));
    data.tenancies.forEach((tenancy) => {
      const startYear = Number(tenancy.startDate.slice(0, 4));
      const endYear = tenancy.endDate ? Number(tenancy.endDate.slice(0, 4)) : currentYear + 1;
      if (!Number.isInteger(startYear) || !Number.isInteger(endYear)) return;
      for (let value = Math.max(1900, startYear); value <= Math.min(3000, endYear); value += 1)
        years.add(value);
    });
    years.add(year);
    return [...years].sort((left, right) => right - left);
  }, [data.costs, data.payments, data.readings, data.tenancies, year]);
  const filtered = useMemo<AppData>(() => {
    if (!propertyId)
      return {
        ...data,
        units: [],
        tenancies: [],
        costs: [],
        meters: [],
        readings: [],
        payments: [],
      };
    const units = data.units.filter((unit) => unit.propertyId === propertyId);
    const unitIds = new Set(units.map((unit) => unit.id));
    const tenancies = data.tenancies.filter((tenancy) => unitIds.has(tenancy.unitId));
    const tenancyIds = new Set(tenancies.map((tenancy) => tenancy.id));
    const meters = data.meters.filter((meter) => unitIds.has(meter.unitId));
    const meterIds = new Set(meters.map((meter) => meter.id));
    return {
      properties: data.properties,
      units,
      tenancies,
      costs: data.costs.filter((cost) => cost.propertyId === propertyId),
      meters,
      readings: data.readings.filter((reading) => meterIds.has(reading.meterId)),
      payments: data.payments.filter((payment) => tenancyIds.has(payment.tenancyId)),
    };
  }, [data, propertyId]);

  function navigate(next: PageId) {
    setPage(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const pageProps = { data: filtered, allData: data, propertyId, year, reload: loadAll };
  const pageScopeKey = `${propertyId}:${year}:${scopeRevision}`;

  return (
    <div className="app-shell">
      <button
        className={`mobile-scrim ${menuOpen ? 'show' : ''}`}
        aria-label="Menü schließen"
        onClick={() => setMenuOpen(false)}
      />
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <button className="brand" type="button" onClick={() => navigate('cockpit')}>
          <img src="/vermietluchs.svg" alt="" />
          <span>
            <strong>Vermietluchs</strong>
            <small>{selectedProperty?.name ?? 'Mietverwaltung lokal'}</small>
          </span>
        </button>
        <nav aria-label="Hauptnavigation">
          {NAVIGATION.map((item, index) => (
            <button
              key={item.id}
              className={page === item.id ? 'active' : ''}
              type="button"
              onClick={() => navigate(item.id)}
            >
              <span className="nav-number">{String(index + 1).padStart(2, '0')}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="local-dot" />
          Lokal gespeichert
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar no-print">
          <button
            className="menu-button"
            type="button"
            aria-label="Navigation öffnen"
            onClick={() => setMenuOpen(true)}
          >
            ☰
          </button>
          <div className="topbar-brand">
            <img src="/vermietluchs.svg" alt="" />
            <strong>Vermietluchs</strong>
          </div>
          <div className="topbar-controls">
            <label>
              <span>Haus</span>
              <select
                value={propertyId ?? ''}
                onChange={(event) =>
                  setPropertyId(event.target.value ? Number(event.target.value) : null)
                }
              >
                {data.properties.length === 0 && <option value="">Noch kein Haus</option>}
                {data.properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Jahr</span>
              <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
                {yearOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <main className="content" aria-busy={initialLoading || refreshing}>
          {initialLoading && <Loading />}
          {!initialLoading && error && <ErrorBox message={error} onRetry={() => void loadAll()} />}
          {!initialLoading && hasLoaded && page === 'cockpit' && (
            <CockpitPage key={pageScopeKey} {...pageProps} onNavigate={navigate} />
          )}
          {!initialLoading && hasLoaded && page === 'properties' && (
            <PropertiesPage key={pageScopeKey} {...pageProps} />
          )}
          {!initialLoading && hasLoaded && page === 'costs' && (
            <CostsPage key={pageScopeKey} {...pageProps} />
          )}
          {!initialLoading && hasLoaded && page === 'meters' && (
            <MetersPage key={pageScopeKey} {...pageProps} />
          )}
          {!initialLoading && hasLoaded && page === 'rent' && (
            <RentPage key={pageScopeKey} {...pageProps} />
          )}
          {!initialLoading && hasLoaded && page === 'settlement' && (
            <SettlementPage key={pageScopeKey} {...pageProps} />
          )}
          {!initialLoading && hasLoaded && page === 'settings' && (
            <SettingsPage key={scopeRevision} reload={loadAll} />
          )}
        </main>
      </div>
    </div>
  );
}

export type PageProps = {
  data: AppData;
  allData: AppData;
  propertyId: number | null;
  year: number;
  reload: () => Promise<void>;
};
