import type {
  ConstellationCategory,
  DataProvider,
  SatelliteOrbitalData,
} from '../types/orbital';
import { normalizeOmmRecord, parseThreeLineElementText } from './parsers';
import { rateLimiter } from './rateLimiter';

const CELESTRAK_GP_BASE = 'https://celestrak.org/NORAD/elements/gp.php';
const CELESTRAK_SUP_GP_BASE = 'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php';

/**
 * Proveedor principal CelesTrak (Sección 4.2):
 * - Consume elementos orbitales en formato OMM/JSON (soportando NORAD IDs de 6 dígitos).
 * - Para Starlink, consume el set suplementario (SupGP) derivado de efemérides de SpaceX
 *   (`sup-gp.php?FILE=starlink&FORMAT=json`), con fallback al grupo GP general.
 */
export class CelesTrakProvider implements DataProvider {
  public readonly id = 'celestrak' as const;
  public readonly displayName = 'CelesTrak (GP + Starlink SupGP)';
  public readonly defaultTtlHours = 12;

  public async isConfigured(): Promise<boolean> {
    return true; // No requiere API Key
  }

  public async getCatalog(category: ConstellationCategory): Promise<SatelliteOrbitalData[]> {
    return rateLimiter.schedule(this.id, async () => {
      const urlsToTry =
        category === 'starlink'
          ? [
              `${CELESTRAK_SUP_GP_BASE}?FILE=starlink&FORMAT=json`,
              `${CELESTRAK_GP_BASE}?GROUP=starlink&FORMAT=json`,
            ]
          : [`${CELESTRAK_GP_BASE}?GROUP=${category}&FORMAT=json`];

      let lastError: unknown = null;

      for (const url of urlsToTry) {
        try {
          const response = await fetch(url, {
            headers: { Accept: 'application/json' },
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status} desde CelesTrak (${url})`);
          }
          const rawJson = (await response.json()) as Array<Record<string, unknown>>;
          if (!Array.isArray(rawJson) || rawJson.length === 0) {
            throw new Error('Respuesta JSON vacía de CelesTrak');
          }

          const fetchedAt = Date.now();
          // Para constelaciones como Starlink (6000+ satélites), tomamos los primeros 200
          // para no saturar la memoria JS del dispositivo móvil.
          const slice = rawJson.slice(0, 200);
          const parsed = slice
            .map((item) => normalizeOmmRecord(item, category, this.id, fetchedAt))
            .filter((item): item is SatelliteOrbitalData => item !== null);

          if (parsed.length > 0) {
            return parsed;
          }
        } catch (err) {
          lastError = err;
        }
      }

      // Fallback final a formato 3LE texto en CelesTrak si el endpoint JSON fallara
      const tleUrl = `${CELESTRAK_GP_BASE}?GROUP=${category}&FORMAT=tle`;
      const tleResp = await fetch(tleUrl);
      if (tleResp.ok) {
        const text = await tleResp.text();
        const parsedTle = parseThreeLineElementText(text, category, this.id).slice(0, 200);
        if (parsedTle.length > 0) {
          return parsedTle;
        }
      }

      throw lastError ?? new Error(`No se pudo obtener el catálogo ${category} desde CelesTrak`);
    });
  }

  public async getOrbitalData(noradId: number): Promise<SatelliteOrbitalData> {
    return rateLimiter.schedule(this.id, async () => {
      const url = `${CELESTRAK_GP_BASE}?CATNR=${noradId}&FORMAT=json`;
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`CelesTrak HTTP ${response.status} para NORAD ${noradId}`);
      }
      const rawJson = (await response.json()) as Array<Record<string, unknown>>;
      if (!Array.isArray(rawJson) || rawJson.length === 0) {
        throw new Error(`NORAD ${noradId} no encontrado en CelesTrak`);
      }
      const record = normalizeOmmRecord(rawJson[0], 'stations', this.id, Date.now());
      if (!record) {
        throw new Error(`Datos OMM inválidos en CelesTrak para NORAD ${noradId}`);
      }
      return record;
    });
  }
}

