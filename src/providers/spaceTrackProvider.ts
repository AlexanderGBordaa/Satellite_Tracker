import type {
  ConstellationCategory,
  DataProvider,
  SatelliteOrbitalData,
} from '../types/orbital';
import { credentialStore } from './credentialStore';
import { normalizeOmmRecord } from './parsers';
import { rateLimiter } from './rateLimiter';

const SPACETRACK_AUTH_URL = 'https://www.space-track.org/ajaxauth/login';
const SPACETRACK_QUERY_BASE = 'https://www.space-track.org/basicspacedata/query';

/**
 * Proveedor alternativo / fallback Space-Track.org (18th Space Defense Squadron).
 * - Requiere cuenta (identity/password) almacenada en SecureStore.
 * - Respeta estrictamente la guía de uso (< 30 requests/min y < 300 requests/hora).
 */
export class SpaceTrackProvider implements DataProvider {
  public readonly id = 'spacetrack' as const;
  public readonly displayName = 'Space-Track.org (18 SDS)';
  public readonly defaultTtlHours = 12;

  private isSessionAuthenticated = false;

  public async isConfigured(): Promise<boolean> {
    const creds = await credentialStore.getCredentials();
    return Boolean(creds.spaceTrackIdentity && creds.spaceTrackPassword);
  }

  private async ensureAuthenticated(): Promise<void> {
    const creds = await credentialStore.getCredentials();
    if (!creds.spaceTrackIdentity || !creds.spaceTrackPassword) {
      throw new Error('NO_CREDENTIALS: Credenciales de Space-Track no configuradas.');
    }

    if (this.isSessionAuthenticated) {
      return;
    }

    const body = `identity=${encodeURIComponent(
      creds.spaceTrackIdentity
    )}&password=${encodeURIComponent(creds.spaceTrackPassword)}`;

    const res = await fetch(SPACETRACK_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      credentials: 'include',
    });

    if (!res.ok) {
      throw new Error(`Autenticación Space-Track fallida (HTTP ${res.status})`);
    }
    this.isSessionAuthenticated = true;
  }

  public async getCatalog(category: ConstellationCategory): Promise<SatelliteOrbitalData[]> {
    return rateLimiter.schedule(this.id, async () => {
      await this.ensureAuthenticated();

      let queryFilter = 'NORAD_CAT_ID/25544,48274,20580,46265';
      if (category === 'starlink') {
        queryFilter = 'OBJECT_NAME/~~STARLINK/DECAY_DATE/null-val/limit/80';
      } else if (category === 'gps-ops') {
        queryFilter = 'OBJECT_NAME/~~GPS/DECAY_DATE/null-val/limit/40';
      } else if (category === 'weather') {
        queryFilter = 'OBJECT_NAME/~~NOAA,~~METEOR/DECAY_DATE/null-val/limit/40';
      } else if (category === 'geo') {
        queryFilter = 'NORAD_CAT_ID/40272,40941,41866';
      }

      const url = `${SPACETRACK_QUERY_BASE}/class/gp/${queryFilter}/orderby/NORAD_CAT_ID%20asc/format/json`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        this.isSessionAuthenticated = false;
        throw new Error(`Space-Track HTTP ${response.status}`);
      }

      const rawList = (await response.json()) as Array<Record<string, unknown>>;
      const fetchedAt = Date.now();
      return rawList
        .map((item) => normalizeOmmRecord(item, category, this.id, fetchedAt))
        .filter((item): item is SatelliteOrbitalData => item !== null);
    });
  }

  public async getOrbitalData(noradId: number): Promise<SatelliteOrbitalData> {
    return rateLimiter.schedule(this.id, async () => {
      await this.ensureAuthenticated();

      const url = `${SPACETRACK_QUERY_BASE}/class/gp/NORAD_CAT_ID/${noradId}/orderby/EPOCH%20desc/limit/1/format/json`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        this.isSessionAuthenticated = false;
        throw new Error(`Space-Track HTTP ${response.status} para NORAD ${noradId}`);
      }

      const rawList = (await response.json()) as Array<Record<string, unknown>>;
      if (!Array.isArray(rawList) || rawList.length === 0) {
        throw new Error(`NORAD ${noradId} no encontrado en Space-Track`);
      }

      const record = normalizeOmmRecord(rawList[0], 'stations', this.id, Date.now());
      if (!record) {
        throw new Error(`Registro GP inválido en Space-Track para NORAD ${noradId}`);
      }
      return record;
    });
  }
}

