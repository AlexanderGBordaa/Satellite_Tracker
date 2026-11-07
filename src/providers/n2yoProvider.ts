import type {
  ConstellationCategory,
  DataProvider,
  ExternalValidationSample,
  ObserverLocation,
  SatelliteOrbitalData,
} from '../types/orbital';
import { credentialStore } from './credentialStore';
import { normalizeTleRecord } from './parsers';
import { rateLimiter } from './rateLimiter';

const N2YO_BASE = 'https://api.n2yo.com/rest/v1/satellite';

interface N2yoTleResponse {
  info: {
    satid: number;
    satname: string;
    transactionscount: number;
  };
  tle: string;
}

interface N2yoPositionsResponse {
  info: {
    satid: number;
    satname: string;
    transactionscount: number;
  };
  positions: Array<{
    satlatitude: number;
    satlongitude: number;
    sataltitude: number;
    azimuth: number;
    elevation: number;
    ra: number;
    dec: number;
    timestamp: number;
  }>;
}

/**
 * Proveedor N2YO (Sección 4.2):
 * - Validación cruzada de posiciones (lat, lon, alt, az, el) para cualquier satélite del catálogo NORAD.
 * - Obtención de TLE como fallback.
 * - Límite de uso: < 1.000 transacciones/hora (TLE y posiciones).
 */
export class N2yoProvider implements DataProvider {
  public readonly id = 'n2yo' as const;
  public readonly displayName = 'N2YO REST API v1';
  public readonly defaultTtlHours = 12;

  public async isConfigured(): Promise<boolean> {
    const creds = await credentialStore.getCredentials();
    return Boolean(creds.n2yoApiKey);
  }

  private async getApiKey(): Promise<string> {
    const creds = await credentialStore.getCredentials();
    if (!creds.n2yoApiKey) {
      throw new Error(
        'NO_CREDENTIALS: API Key de N2YO no configurada. Ingrésela en la pestaña Validación / APIs.'
      );
    }
    return creds.n2yoApiKey;
  }

  public async getCatalog(category: ConstellationCategory): Promise<SatelliteOrbitalData[]> {
    // N2YO no ofrece descarga masiva de constelación en una sola llamada económica;
    // como fallback de catálogo consulta los NORAD IDs representativos de la categoría.
    const defaultIdsByCategory: Record<ConstellationCategory, number[]> = {
      stations: [25544, 48274, 20580],
      starlink: [44713, 44714, 44715],
      'gps-ops': [24876, 41328],
      weather: [33591, 43013],
      geo: [40272, 40941, 41866],
    };

    const ids = defaultIdsByCategory[category] ?? [25544];
    const results: SatelliteOrbitalData[] = [];
    for (const id of ids) {
      try {
        const sat = await this.getOrbitalData(id);
        results.push({ ...sat, category });
      } catch {
        // Continuar con el siguiente
      }
    }
    if (results.length === 0) {
      throw new Error(`No se pudo construir catálogo ${category} desde N2YO`);
    }
    return results;
  }

  public async getOrbitalData(noradId: number): Promise<SatelliteOrbitalData> {
    const apiKey = await this.getApiKey();

    return rateLimiter.schedule(this.id, async () => {
      const url = `${N2YO_BASE}/tle/${noradId}&apiKey=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`N2YO TLE HTTP ${response.status}`);
      }
      const data = (await response.json()) as N2yoTleResponse & { error?: string };
      if (data.error) {
        throw new Error(`N2YO API Error: ${data.error}`);
      }
      if (!data.tle) {
        throw new Error(`N2YO no devolvió TLE para NORAD ${noradId}`);
      }

      const lines = data.tle.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        throw new Error(`Formato TLE incompleto en N2YO para NORAD ${noradId}`);
      }

      const record = normalizeTleRecord(
        data.info?.satname || `NORAD ${noradId}`,
        lines[0],
        lines[1],
        'stations',
        this.id,
        Date.now()
      );
      if (!record) {
        throw new Error(`Error parseando TLE de N2YO para NORAD ${noradId}`);
      }
      return record;
    });
  }

  public async getValidationPosition(
    noradId: number,
    observer: ObserverLocation
  ): Promise<ExternalValidationSample> {
    const apiKey = await this.getApiKey();

    return rateLimiter.schedule(this.id, async () => {
      const lat = observer.latitudeDeg.toFixed(5);
      const lng = observer.longitudeDeg.toFixed(5);
      const alt = Math.round(observer.altitudeMeters);

      const url = `${N2YO_BASE}/positions/${noradId}/${lat}/${lng}/${alt}/1/&apiKey=${encodeURIComponent(
        apiKey
      )}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`N2YO Positions HTTP ${response.status}`);
      }
      const data = (await response.json()) as N2yoPositionsResponse & { error?: string };
      if (data.error) {
        throw new Error(`N2YO API Error: ${data.error}`);
      }
      const pos = data.positions?.[0];
      if (!pos) {
        throw new Error(`N2YO no devolvió posiciones para NORAD ${noradId}`);
      }

      return {
        provider: this.id,
        noradId,
        satelliteName: data.info?.satname || `SAT ${noradId}`,
        timestampMs: pos.timestamp * 1000,
        latitudeDeg: Number(pos.satlatitude),
        longitudeDeg: Number(pos.satlongitude),
        altitudeKm: Number(pos.sataltitude),
        azimuthDeg: Number(pos.azimuth),
        elevationDeg: Number(pos.elevation),
      };
    });
  }
}

