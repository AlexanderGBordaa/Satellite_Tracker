import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  computeGroundTrackSegments,
  computeSatelliteTelemetry,
  propagateConstellationBatch,
} from '../orbital/orbitalEngine';
import { predictUpcomingPasses } from '../prediction/passPredictor';
import { dataOrchestrator } from '../providers/dataProviderOrchestrator';
import { getOfflineSeedCatalog } from '../providers/offlineSeedData';
import { orbitalCache, type CacheStats } from '../providers/orbitalCache';
import { rateLimiter } from '../providers/rateLimiter';
import { registerBackgroundOrbitalSync } from '../services/notificationService';
import { PRESET_LOCATIONS, requestDeviceGpsLocation } from '../services/observerService';
import type {
  ConstellationCategory,
  DataProviderId,
  GroundTrackSegment,
  ObserverLocation,
  PassWindow,
  RateLimiterStatus,
  SatelliteOrbitalData,
  SatelliteTelemetry,
  SubsatellitePoint,
  ValidationComparisonResult,
} from '../types/orbital';

interface SatelliteTrackerContextValue {
  // Catálogo y selección
  activeCategory: ConstellationCategory;
  setActiveCategory: (cat: ConstellationCategory) => void;
  catalog: SatelliteOrbitalData[];
  isLoadingCatalog: boolean;
  catalogSource: DataProviderId;
  catalogFromCache: boolean;
  fallbackLog: string[];
  selectedSatellite: SatelliteOrbitalData;
  selectSatellite: (sat: SatelliteOrbitalData) => void;
  fetchSatelliteByNoradId: (noradId: number) => Promise<SatelliteOrbitalData>;
  refreshCurrentCatalog: (force?: boolean) => Promise<void>;

  // Telemetría en tiempo real y visualizaciones geográficas
  telemetry: SatelliteTelemetry | null;
  groundTrackSegments: GroundTrackSegment[];
  minElevationDeg: number;
  setMinElevationDeg: (deg: number) => void;
  refreshIntervalMs: number;
  setRefreshIntervalMs: (ms: number) => void;

  // Capa de constelación Starlink (RF-13)
  showConstellationLayer: boolean;
  setShowConstellationLayer: (show: boolean) => void;
  constellationLimit: number;
  setConstellationLimit: (limit: number) => void;
  constellationPoints: SubsatellitePoint[];

  // Observador terrestre
  observer: ObserverLocation;
  setObserver: (loc: ObserverLocation) => void;
  useGpsLocation: () => Promise<void>;

  // Predicción de ventanas de visibilidad (RF-04, RF-05, RF-06)
  upcomingPasses: PassWindow[];
  selectedPass: PassWindow | null;
  setSelectedPass: (pass: PassWindow | null) => void;
  isPredictingPasses: boolean;
  recalculatePasses: () => void;
  notificationLeadMinutes: number;
  setNotificationLeadMinutes: (min: number) => void;

  // Validación cruzada y estado de proveedores (RF-14, RF-15, RF-16)
  validationHistory: ValidationComparisonResult[];
  isRunningValidation: boolean;
  runValidation: (providerId: 'wheretheiss' | 'n2yo') => Promise<ValidationComparisonResult>;
  rateLimitStatuses: RateLimiterStatus[];
  cacheStats: CacheStats | null;
  refreshSystemStatus: () => Promise<void>;
}

const SatelliteTrackerContext = createContext<SatelliteTrackerContextValue | null>(null);

export const SatelliteTrackerProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const initialSeeds = useMemo(() => getOfflineSeedCatalog('stations'), []);
  const [activeCategory, setActiveCategoryState] = useState<ConstellationCategory>('stations');
  const [catalog, setCatalog] = useState<SatelliteOrbitalData[]>(initialSeeds);
  const [selectedSatellite, setSelectedSatellite] = useState<SatelliteOrbitalData>(
    initialSeeds[0]
  );
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(false);
  const [catalogSource, setCatalogSource] = useState<DataProviderId>('offline-seed');
  const [catalogFromCache, setCatalogFromCache] = useState<boolean>(false);
  const [fallbackLog, setFallbackLog] = useState<string[]>([]);

  const [observer, setObserver] = useState<ObserverLocation>(PRESET_LOCATIONS[0]);
  const [minElevationDeg, setMinElevationDeg] = useState<number>(10);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState<number>(2000);
  const [notificationLeadMinutes, setNotificationLeadMinutes] = useState<number>(10);

  const [telemetry, setTelemetry] = useState<SatelliteTelemetry | null>(() =>
    computeSatelliteTelemetry(initialSeeds[0], PRESET_LOCATIONS[0], new Date(), 10)
  );
  const [groundTrackSegments, setGroundTrackSegments] = useState<GroundTrackSegment[]>(() =>
    computeGroundTrackSegments(initialSeeds[0], new Date())
  );

  // Capa de constelación Starlink (RF-13)
  const [showConstellationLayer, setShowConstellationLayer] = useState<boolean>(false);
  const [constellationLimit, setConstellationLimit] = useState<number>(40);
  const [starlinkCatalog, setStarlinkCatalog] = useState<SatelliteOrbitalData[]>(() =>
    getOfflineSeedCatalog('starlink')
  );
  const [constellationPoints, setConstellationPoints] = useState<SubsatellitePoint[]>([]);

  // Pases predichos (RF-04)
  const [upcomingPasses, setUpcomingPasses] = useState<PassWindow[]>([]);
  const [selectedPass, setSelectedPass] = useState<PassWindow | null>(null);
  const [isPredictingPasses, setIsPredictingPasses] = useState<boolean>(false);

  // Validación y métricas de APIs (RF-15)
  const [validationHistory, setValidationHistory] = useState<ValidationComparisonResult[]>([]);
  const [isRunningValidation, setIsRunningValidation] = useState<boolean>(false);
  const [rateLimitStatuses, setRateLimitStatuses] = useState<RateLimiterStatus[]>(() =>
    rateLimiter.getAllStatuses()
  );
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);

  const lastGroundTrackCalcMs = useRef<number>(0);

  const refreshSystemStatus = useCallback(async () => {
    setRateLimitStatuses(rateLimiter.getAllStatuses());
    const stats = await orbitalCache.getStats();
    setCacheStats(stats);
  }, []);

  const loadCategoryCatalog = useCallback(
    async (category: ConstellationCategory, force: boolean = false) => {
      setIsLoadingCatalog(true);
      try {
        const result = await dataOrchestrator.getCatalog(category, force);
        setCatalog(result.satellites);
        setCatalogSource(result.sourceProvider);
        setCatalogFromCache(result.fromCache);
        setFallbackLog(result.fallbackChainLog);

        if (category === 'starlink') {
          setStarlinkCatalog(result.satellites);
        }

        // Si el satélite seleccionado está en este catálogo, actualizamos sus elementos orbitales
        setSelectedSatellite((prev) => {
          const updated = result.satellites.find((s) => s.noradId === prev.noradId);
          return updated ?? prev;
        });
      } finally {
        setIsLoadingCatalog(false);
        await refreshSystemStatus();
      }
    },
    [refreshSystemStatus]
  );

  // Inicialización al montar la aplicación
  useEffect(() => {
    loadCategoryCatalog('stations', false);
    registerBackgroundOrbitalSync();
  }, [loadCategoryCatalog]);

  // Si se activa la capa de constelación Starlink, aseguramos cargar el set suplementario de Starlink
  useEffect(() => {
    if (showConstellationLayer) {
      dataOrchestrator
        .getCatalog('starlink', false)
        .then((res) => {
          if (res.satellites.length > 0) {
            setStarlinkCatalog(res.satellites);
          }
          refreshSystemStatus();
        })
        .catch(() => {
          // Mantener semilla Starlink si no hay red
        });
    }
  }, [showConstellationLayer, refreshSystemStatus]);

  // Loop de propagación SGP4 en tiempo real (RF-02, RF-03, RF-10, RF-13)
  useEffect(() => {
    const updateRealtimePositions = () => {
      const now = new Date();
      const nextTelemetry = computeSatelliteTelemetry(
        selectedSatellite,
        observer,
        now,
        minElevationDeg
      );
      setTelemetry(nextTelemetry);

      // Recalcular ground track cada 30 segundos o al cambiar de satélite
      if (now.getTime() - lastGroundTrackCalcMs.current > 30000) {
        lastGroundTrackCalcMs.current = now.getTime();
        setGroundTrackSegments(computeGroundTrackSegments(selectedSatellite, now));
      }

      if (showConstellationLayer) {
        const batch = propagateConstellationBatch(starlinkCatalog, now, constellationLimit);
        setConstellationPoints(batch);
      } else {
        setConstellationPoints([]);
      }
    };

    lastGroundTrackCalcMs.current = 0; // Forzar cálculo inmediato del ground track
    updateRealtimePositions();

    const timer = setInterval(updateRealtimePositions, refreshIntervalMs);
    return () => clearInterval(timer);
  }, [
    selectedSatellite,
    observer,
    minElevationDeg,
    refreshIntervalMs,
    showConstellationLayer,
    starlinkCatalog,
    constellationLimit,
  ]);

  // Cálculo de ventanas de visibilidad (AOS / TCA / LOS)
  const recalculatePasses = useCallback(() => {
    setIsPredictingPasses(true);
    setTimeout(() => {
      try {
        const predicted = predictUpcomingPasses(selectedSatellite, observer, {
          startDate: new Date(),
          hoursAhead: 24,
          minMaxElevationDeg: minElevationDeg,
          maxPasses: 8,
        });
        setUpcomingPasses(predicted);
        setSelectedPass((prev) => {
          if (prev && predicted.some((p) => p.id === prev.id)) {
            return prev;
          }
          return predicted[0] ?? null;
        });
      } finally {
        setIsPredictingPasses(false);
      }
    }, 10);
  }, [selectedSatellite, observer, minElevationDeg]);

  useEffect(() => {
    recalculatePasses();
  }, [recalculatePasses]);

  const setActiveCategory = useCallback(
    (cat: ConstellationCategory) => {
      setActiveCategoryState(cat);
      loadCategoryCatalog(cat, false);
    },
    [loadCategoryCatalog]
  );

  const selectSatellite = useCallback((sat: SatelliteOrbitalData) => {
    lastGroundTrackCalcMs.current = 0;
    setSelectedSatellite(sat);
  }, []);

  const fetchSatelliteByNoradId = useCallback(
    async (noradId: number): Promise<SatelliteOrbitalData> => {
      const sat = await dataOrchestrator.getOrbitalDataByNoradId(noradId, false);
      lastGroundTrackCalcMs.current = 0;
      setSelectedSatellite(sat);
      await refreshSystemStatus();
      return sat;
    },
    [refreshSystemStatus]
  );

  const refreshCurrentCatalog = useCallback(
    async (force: boolean = true) => {
      await loadCategoryCatalog(activeCategory, force);
    },
    [activeCategory, loadCategoryCatalog]
  );

  const useGpsLocation = useCallback(async () => {
    const loc = await requestDeviceGpsLocation();
    setObserver(loc);
  }, []);

  const runValidation = useCallback(
    async (providerId: 'wheretheiss' | 'n2yo'): Promise<ValidationComparisonResult> => {
      setIsRunningValidation(true);
      try {
        const result = await dataOrchestrator.validateSatellitePosition(
          selectedSatellite,
          observer,
          providerId
        );
        setValidationHistory((prev) => [result, ...prev.slice(0, 19)]);
        return result;
      } finally {
        setIsRunningValidation(false);
        await refreshSystemStatus();
      }
    },
    [selectedSatellite, observer, refreshSystemStatus]
  );

  const value = useMemo<SatelliteTrackerContextValue>(
    () => ({
      activeCategory,
      setActiveCategory,
      catalog,
      isLoadingCatalog,
      catalogSource,
      catalogFromCache,
      fallbackLog,
      selectedSatellite,
      selectSatellite,
      fetchSatelliteByNoradId,
      refreshCurrentCatalog,
      telemetry,
      groundTrackSegments,
      minElevationDeg,
      setMinElevationDeg,
      refreshIntervalMs,
      setRefreshIntervalMs,
      showConstellationLayer,
      setShowConstellationLayer,
      constellationLimit,
      setConstellationLimit,
      constellationPoints,
      observer,
      setObserver,
      useGpsLocation,
      upcomingPasses,
      selectedPass,
      setSelectedPass,
      isPredictingPasses,
      recalculatePasses,
      notificationLeadMinutes,
      setNotificationLeadMinutes,
      validationHistory,
      isRunningValidation,
      runValidation,
      rateLimitStatuses,
      cacheStats,
      refreshSystemStatus,
    }),
    [
      activeCategory,
      setActiveCategory,
      catalog,
      isLoadingCatalog,
      catalogSource,
      catalogFromCache,
      fallbackLog,
      selectedSatellite,
      selectSatellite,
      fetchSatelliteByNoradId,
      refreshCurrentCatalog,
      telemetry,
      groundTrackSegments,
      minElevationDeg,
      refreshIntervalMs,
      showConstellationLayer,
      constellationLimit,
      constellationPoints,
      observer,
      useGpsLocation,
      upcomingPasses,
      selectedPass,
      isPredictingPasses,
      recalculatePasses,
      notificationLeadMinutes,
      validationHistory,
      isRunningValidation,
      runValidation,
      rateLimitStatuses,
      cacheStats,
      refreshSystemStatus,
    ]
  );

  return (
    <SatelliteTrackerContext.Provider value={value}>
      {children}
    </SatelliteTrackerContext.Provider>
  );
};

export function useSatelliteTracker(): SatelliteTrackerContextValue {
  const ctx = useContext(SatelliteTrackerContext);
  if (!ctx) {
    throw new Error('useSatelliteTracker debe usarse dentro de SatelliteTrackerProvider');
  }
  return ctx;
}

