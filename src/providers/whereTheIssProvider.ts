import type {
  ConstellationCategory,
  DataProvider,
  ExternalValidationSample,
  ObserverLocation,
  SatelliteOrbitalData,
} from '../types/orbital';
import { normalizeTleRecord } from './parsers';
import { rateLimiter } from './rateLimiter';

const WTIA_BASE = 'https://api.wheretheiss.at/v1/satellites/25544';

interface WtiaPositionResponse {
  name: string;
  id: number;
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number; // km/h en WhereTheISSAt!
  visibility: string;
  footprint: number;
  timestamp: number; // segundos Unix
  daynum: number;
  solar_lat: number;
  solar_lon: number;
  units: string;
}

interface WtiaTleResponse {
  requested_timestamp: number;
  tle_timestamp: number;
  id: string;
  name: string;
  header: string;
  line1: string;
  line2: string;
}

/**
 * Proveedor Where the ISS at? (Sección 4.2):
 * - No requiere autenticación.
 * - Soporta validación cruzada en tiempo real de la ISS (NORAD 25544) y descarga de su TLE.
 */
export class WhereTheIssProvider implements DataProvider {
  public readonly id = 'wheretheiss' as const;
  public readonly displayName = 'Where the ISS at? (API REST)';
  public readonly defaultTtlHours = 12;

  public async isConfigured(): Promise<boolean> {
    return true;
  }

  public async getCatalog(category: ConstellationCategory): Promise<SatelliteOrbitalData[]> {
    if (category !== 'stations') {
      throw new Error('Where the ISS at? solo provee datos para la ISS (NORAD 25544).');
    }
    const iss = await this.getOrbitalData(25544);
    return [iss];
  }

  public async getOrbitalData(noradId: number): Promise<SatelliteOrbitalData> {
    if (noradId !== 25544) {
      throw new Error(`Where the ISS at? solo soporta NORAD 25544 (solicitado: ${noradId})`);
    }

    return rateLimiter.schedule(this.id, async () => {
      const response = await fetch(`${WTIA_BASE}/tles`);
      if (!response.ok) {
        throw new Error(`WhereTheISSAt TLE HTTP ${response.status}`);
      }
      const data = (await response.json()) as WtiaTleResponse;
      const record = normalizeTleRecord(
        data.header || 'ISS (ZARYA)',
        data.line1,
        data.line2,
        'stations',
        this.id,
        Date.now()
      );
      if (!record) {
        throw new Error('TLE inválido recibido desde Where the ISS at?');
      }
      return record;
    });
  }

  public async getValidationPosition(
    noradId: number,
    _observer: ObserverLocation
  ): Promise<ExternalValidationSample> {
    if (noradId !== 25544) {
      throw new Error(
        `Where the ISS at? únicamente expone posiciones para la ISS (NORAD 25544). Para el satélite ${noradId} utilice N2YO.`
      );
    }

    return rateLimiter.schedule(this.id, async () => {
      const response = await fetch(`${WTIA_BASE}?units=kilometers`);
      if (!response.ok) {
        throw new Error(`Where the ISS at? HTTP ${response.status}`);
      }
      const data = (await response.json()) as WtiaPositionResponse;
      // Nota: Where the ISS at? devuelve velocity en km/h; convertimos a km/s dividiendo por 3600
      return {
        provider: this.id,
        noradId: 25544,
        satelliteName: 'ISS (ZARYA)',
        timestampMs: data.timestamp * 1000,
        latitudeDeg: Number(data.latitude),
        longitudeDeg: Number(data.longitude),
        altitudeKm: Number(data.altitude),
        velocityKmPerSec: Number(data.velocity) / 3600,
      };
    });
  }
}

