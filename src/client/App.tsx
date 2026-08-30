import { useEffect, useMemo, useRef, useState } from 'react';
import { DATA_CONFLICT_EVENT, getJson } from './api';
import { ErrorBox, Loading } from './components/Common';
import ThemeToggle from './components/ThemeToggle';
import { applyTheme, readInitialTheme, type ThemeMode } from './theme';
import type {
  AiSettings,
  AppData,
  Cost,
  Meter,
  Payment,
  Property,
  Reading,
  Tenancy,
  Unit,
} from './types';
import CockpitPage from './pages/CockpitPage';
import PropertiesPage from './pages/PropertiesPage';
import CostsPage from './pages/CostsPage';
import MetersPage from './pages/MetersPage';
import RentPage from './pages/RentPage';
import SettlementPage from './pages/SettlementPage';
import SettingsPage from './pages/SettingsPage';
import AiScanPage from './pages/AiScanPage';

export type PageId =
  'cockpit' | 'properties' | 'costs' | 'meters' | 'rent' | 'ai-scan' | 'settlement' | 'settings';

const NAVIGATION_GROUPS: {
  label: string;
  items: { id: PageId; label: string; requiresAi?: boolean }[];
}[] = [
  {
    label: 'Übersicht',
    items: [{ id: 'cockpit', label: 'Cockpit' }],
  },
  {
    label: 'Verwalten · laufend',
    items: [
      { id: 'meters', label: 'Zähler & Ablesungen' },
      { id: 'costs', label: 'Kosten' },
      { id: 'rent', label: 'Mietkonto' },
      { id: 'ai-scan', label: 'KI-Scan', requiresAi: true },
    ],
  },
  {
    label: 'Abrechnen · Jahresende',
    items: [{ id: 'settlement', label: 'Abrechnung' }],
  },
  {
    label: 'Einrichten · selten',
    items: [
      { id: 'properties', label: 'Stammdaten' },
      { id: 'settings', label: 'Einstellungen' },
    ],
  },
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
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState('');
  const [scopeRevision, setScopeRevision] = useState(0);
  const loadedOnce = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(readInitialTheme);
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
      const [properties, units, tenancies, costs, meters, readings, payments, loadedAiSettings] =
        await Promise.all([
          getJson<Property[]>('/api/properties'),
          getJson<Unit[]>('/api/units'),
          getJson<Tenancy[]>('/api/tenancies'),
          getJson<Cost[]>('/api/costs'),
          getJson<Meter[]>('/api/meters'),
          getJson<Reading[]>('/api/readings'),
          getJson<Payment[]>('/api/payments'),
          getJson<AiSettings>('/api/ai/settings'),
        ]);
      setData({ properties, units, tenancies, costs, meters, readings, payments });
      setAiSettings(loadedAiSettings);
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
  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('vermietluchs-theme', theme);
  }, [theme]);

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
      <aside id="main-navigation" className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <button className="brand" type="button" onClick={() => navigate('cockpit')}>
          <img src="/vermietluchs.svg" alt="" />
          <span>
            <strong>Vermietluchs</strong>
            <small>{selectedProperty?.name ?? 'Mietverwaltung lokal'}</small>
          </span>
        </button>
        <nav aria-label="Hauptnavigation">
          {NAVIGATION_GROUPS.map((group) => (
            <div className="navigation-group" key={group.label}>
              <p className="nav-category">{group.label}</p>
              {group.items
                .filter((item) => !item.requiresAi || aiSettings?.enabled)
                .map((item) => (
                  <button
                    key={item.id}
                    className={page === item.id ? 'active' : ''}
                    type="button"
                    aria-current={page === item.id ? 'page' : undefined}
                    onClick={() => navigate(item.id)}
                  >
                    <span className="nav-dot" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ThemeToggle
            theme={theme}
            onToggle={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
          />
          <div className="sidebar-foot">
            <span className="local-dot" aria-hidden="true" />
            {aiSettings?.enabled && aiSettings.provider !== 'ollama'
              ? 'KI-PDFs werden an die Cloud übertragen'
              : 'Alle Daten bleiben lokal'}
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar no-print">
          <button
            className="menu-button"
            type="button"
            aria-label="Navigation öffnen"
            aria-controls="main-navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            ☰
          </button>
          <div className="topbar-brand">
            <img src="/vermietluchs.svg" alt="" />
            <strong>Vermietluchs</strong>
          </div>
          <div className="topbar-controls" role="group" aria-label="Aktuelle Auswahl">
            <label>
              <span>Haus</span>
              <select
                aria-label="Haus auswählen"
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
              <select
                aria-label="Abrechnungsjahr auswählen"
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
              >
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
          {!initialLoading && hasLoaded && page === 'ai-scan' && aiSettings?.enabled && (
            <AiScanPage key={pageScopeKey} {...pageProps} aiSettings={aiSettings} />
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
