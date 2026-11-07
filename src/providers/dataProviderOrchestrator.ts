import {
  computeLookAngles,
  computePositionErrorMetrics,
  propagateSubsatellitePoint,
} from '../orbital/orbitalEngine';
import type {
  ConstellationCategory,
  DataProvider,
  DataProviderId,
  ObserverLocation,
  SatelliteOrbitalData,
  ValidationComparisonResult,
} from '../types/orbital';
import { CelesTrakProvider } from './celestrakProvider';
import { N2yoProvider } from './n2yoProvider';
import { getOfflineSeedCatalog } from './offlineSeedData';
import { orbitalCache } from './orbitalCache';
import { SpaceTrackProvider } from './spaceTrackProvider';
import { WhereTheIssProvider } from './whereTheIssProvider';

export interface CatalogFetchResult {
  satellites: SatelliteOrbitalData[];
  sourceProvider: DataProviderId;
  fromCache: boolean;
  isExpiredFallback: boolean;
  fetchedAtMs: number;
  fallbackChainLog: string[];
}

class DataProviderOrchestrator {
  private readonly celestrak = new CelesTrakProvider();
  private readonly spacetrack = new SpaceTrackProvider();
  private readonly n2yo = new N2yoProvider();
  private readonly wheretheiss = new WhereTheIssProvider();

  public getProviders(): DataProvider[] {
    return [this.celestrak, this.spacetrack, this.n2yo, this.wheretheiss];
  }

  /**
   * Obtiene el catálogo de una constelación aplicando:
   * 1. Caché local si está vigente (< TTL 12-24h) y no se fuerza recarga.
   * 2. Cadena de proveedores con conmutación ante fallas (CelesTrak -> Space-Track -> WhereTheISS/N2YO).
   * 3. Respaldo en caché expirada o semilla offline en caso de falta total de conectividad.
   */
  public async getCatalog(
    category: ConstellationCategory,
    forceRefresh: boolean = false
  ): Promise<CatalogFetchResult> {
    const fallbackChainLog: string[] = [];

    const cached = await orbitalCache.getCatalog(category);
    if (cached && !cached.isExpired && !forceRefresh) {
      fallbackChainLog.push(
        `Caché local vigente (${cached.bucket.providerId}, antigüedad ${(
          (Date.now() - cached.bucket.fetchedAtMs) /
          3600000
        ).toFixed(1)}h)`
      );
      return {
        satellites: cached.bucket.data,
        sourceProvider: cached.bucket.providerId,
        fromCache: true,
        isExpiredFallback: false,
        fetchedAtMs: cached.bucket.fetchedAtMs,
        fallbackChainLog,
      };
    }

    const candidateProviders: DataProvider[] = [
      this.celestrak,
      this.spacetrack,
      ...(category === 'stations' ? [this.wheretheiss] : []),
      this.n2yo,
    ];

    for (const provider of candidateProviders) {
      const configured = await provider.isConfigured();
      if (!configured) {
        fallbackChainLog.push(`${provider.displayName}: omitido (sin credenciales)`);
        continue;
      }

      try {
        const list = await provider.getCatalog(category);
        if (list.length > 0) {
          // Si estamos en "stations", garantizamos que existan otros satélites de referencia además de ISS si el fallback fue WhereTheISS
          let mergedList = list;
          if (provider.id === 'wheretheiss' && category === 'stations') {
            const seeds = getOfflineSeedCatalog('stations').filter((s) => s.noradId !== 25544);
            mergedList = [...list, ...seeds];
          }

          await orbitalCache.setCatalog(category, mergedList, provider.id);
          fallbackChainLog.push(`${provider.displayName}: éxito (${mergedList.length} satélites)`);

          return {
            satellites: mergedList,
            sourceProvider: provider.id,
            fromCache: false,
            isExpiredFallback: false,
            fetchedAtMs: Date.now(),
            fallbackChainLog,
          };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        fallbackChainLog.push(`${provider.displayName}: fallo (${msg})`);
      }
    }

    // Si todos los proveedores online fallaron pero tenemos caché expirada, la usamos e informamos
    if (cached && cached.bucket.data.length > 0) {
      fallbackChainLog.push('Fallback a caché local expirada (modo sin conexión)');
      return {
        satellites: cached.bucket.data,
        sourceProvider: cached.bucket.providerId,
        fromCache: true,
        isExpiredFallback: true,
        fetchedAtMs: cached.bucket.fetchedAtMs,
        fallbackChainLog,
      };
    }

    // Último eslabón de contingencia: datos orbitales semilla embebidos
    const offlineSeeds = getOfflineSeedCatalog(category);
    fallbackChainLog.push(`Fallback a semilla offline integrada (${offlineSeeds.length} satélites)`);
    return {
      satellites: offlineSeeds,
      sourceProvider: 'offline-seed',
      fromCache: false,
      isExpiredFallback: true,
      fetchedAtMs: Date.now(),
      fallbackChainLog,
    };
  }

  /**
   * Busca los datos orbitales de un satélite específico por su NORAD ID (RF-01, RF-14).
   */
  public async getOrbitalDataByNoradId(
    noradId: number,
    forceRefresh: boolean = false
  ): Promise<SatelliteOrbitalData> {
    if (!forceRefresh) {
      const cached = await orbitalCache.getSatellite(noradId);
      if (cached && !cached.isExpired) {
        return cached.bucket.data;
      }
    }

    const providers: DataProvider[] = [
      this.celestrak,
      ...(noradId === 25544 ? [this.wheretheiss] : []),
      this.spacetrack,
      this.n2yo,
    ];

    for (const provider of providers) {
      if (!(await provider.isConfigured())) continue;
      try {
        const data = await provider.getOrbitalData(noradId);
        await orbitalCache.setSatellite(data, provider.id);
        return data;
      } catch {
        // Intentar siguiente proveedor en la cadena de fallback
      }
    }

    const cachedFallback = await orbitalCache.getSatellite(noradId);
    if (cachedFallback) {
      return cachedFallback.bucket.data;
    }

    // Buscar en semillas offline
    const categories: ConstellationCategory[] = ['stations', 'starlink', 'gps-ops', 'weather', 'geo'];
    for (const cat of categories) {
      const found = getOfflineSeedCatalog(cat).find((s) => s.noradId === noradId);
      if (found) return found;
    }

    throw new Error(`No se hallaron datos orbitales para el NORAD ID ${noradId} en ningún proveedor.`);
  }

  /**
   * Modo Validación (RF-15):
   * Consulta en vivo la posición reportada por `Where the ISS at?` (para ISS 25544) o `N2YO`
   * (para cualquier satélite), propaga localmente con SGP4 en el MISMO instante `timestampMs`
   * reportado por el proveedor externo y calcula el error superficial (Haversine) y 3D (ECEF) en km.
   */
  public async validateSatellitePosition(
    orbital: SatelliteOrbitalData,
    observer: ObserverLocation,
    targetProviderId: 'wheretheiss' | 'n2yo'
  ): Promise<ValidationComparisonResult> {
    const provider = targetProviderId === 'wheretheiss' ? this.wheretheiss : this.n2yo;

    if (!provider.getValidationPosition) {
      throw new Error(`El proveedor ${provider.displayName} no soporta validación de posición.`);
    }

    const externalSample = await provider.getValidationPosition(orbital.noradId, observer);
    const evalDate = new Date(externalSample.timestampMs);

    const localSub = propagateSubsatellitePoint(orbital, evalDate);
    if (!localSub) {
      throw new Error('Error al propagar localmente con SGP4 para el instante de validación.');
    }

    const localLook = computeLookAngles(localSub, observer, 0);
    const posMetrics = computePositionErrorMetrics(
      {
        latitudeDeg: localSub.latitudeDeg,
        longitudeDeg: localSub.longitudeDeg,
        altitudeKm: localSub.altitudeKm,
      },
      {
        latitudeDeg: externalSample.latitudeDeg,
        longitudeDeg: externalSample.longitudeDeg,
        altitudeKm: externalSample.altitudeKm,
      }
    );

    const azimuthDiffDeg =
      externalSample.azimuthDeg !== undefined
        ? Math.abs(
            ((localLook.azimuthDeg - externalSample.azimuthDeg + 540) % 360) - 180
          )
        : undefined;

    const elevationDiffDeg =
      externalSample.elevationDeg !== undefined
        ? Math.abs(localLook.elevationDeg - externalSample.elevationDeg)
        : undefined;

    const orbitalDataAgeHours = Math.max(
      0,
      (externalSample.timestampMs - orbital.epochTimestampMs) / (1000 * 3600)
    );

    return {
      id: `${orbital.noradId}-${targetProviderId}-${externalSample.timestampMs}`,
      timestampMs: externalSample.timestampMs,
      noradId: orbital.noradId,
      satelliteName: orbital.name,
      externalProvider: targetProviderId,
      orbitalDataSource: orbital.sourceProvider,
      orbitalDataAgeHours,
      localPosition: {
        latitudeDeg: localSub.latitudeDeg,
        longitudeDeg: localSub.longitudeDeg,
        altitudeKm: localSub.altitudeKm,
        azimuthDeg: localLook.azimuthDeg,
        elevationDeg: localLook.elevationDeg,
      },
      externalPosition: {
        latitudeDeg: externalSample.latitudeDeg,
        longitudeDeg: externalSample.longitudeDeg,
        altitudeKm: externalSample.altitudeKm,
        azimuthDeg: externalSample.azimuthDeg,
        elevationDeg: externalSample.elevationDeg,
      },
      metrics: {
        ...posMetrics,
        azimuthDiffDeg,
        elevationDiffDeg,
      },
    };
  }
}

export const dataOrchestrator = new DataProviderOrchestrator();

