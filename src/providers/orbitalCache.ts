import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  ConstellationCategory,
  DataProviderId,
  SatelliteOrbitalData,
} from '../types/orbital';

const CACHE_PREFIX_CATALOG = 'sat_cache_catalog_v1_';
const CACHE_PREFIX_SAT = 'sat_cache_norad_v1_';
const CACHE_META_KEY = 'sat_cache_metadata_v1';

export interface CacheBucket<T> {
  data: T;
  fetchedAtMs: number;
  ttlHours: number;
  providerId: DataProviderId;
}

export interface CacheStats {
  cachedCategories: ConstellationCategory[];
  totalCachedSatellites: number;
  lastUpdatedAtMs: number | null;
  ttlHours: number;
}

class OrbitalCacheManager {
  private defaultTtlHours = 12; // Rango requerido por RF-09: 12-24 h

  public getTtlHours(): number {
    return this.defaultTtlHours;
  }

  public setTtlHours(hours: number): void {
    this.defaultTtlHours = Math.max(1, Math.min(48, hours));
  }

  public isExpired(fetchedAtMs: number, ttlHours: number = this.defaultTtlHours): boolean {
    const ageMs = Date.now() - fetchedAtMs;
    return ageMs > ttlHours * 3600 * 1000;
  }

  public async getCatalog(
    category: ConstellationCategory
  ): Promise<{ bucket: CacheBucket<SatelliteOrbitalData[]>; isExpired: boolean } | null> {
    try {
      const raw = await AsyncStorage.getItem(`${CACHE_PREFIX_CATALOG}${category}`);
      if (!raw) return null;
      const bucket = JSON.parse(raw) as CacheBucket<SatelliteOrbitalData[]>;
      const isExpired = this.isExpired(bucket.fetchedAtMs, bucket.ttlHours || this.defaultTtlHours);
      return { bucket, isExpired };
    } catch {
      return null;
    }
  }

  public async setCatalog(
    category: ConstellationCategory,
    satellites: SatelliteOrbitalData[],
    providerId: DataProviderId,
    ttlHours: number = this.defaultTtlHours
  ): Promise<void> {
    try {
      const now = Date.now();
      // Para constelaciones masivas como Starlink (miles de objetos), almacenamos hasta 250 en caché persistente
      const capped = satellites.slice(0, 250);
      const bucket: CacheBucket<SatelliteOrbitalData[]> = {
        data: capped,
        fetchedAtMs: now,
        ttlHours,
        providerId,
      };
      await AsyncStorage.setItem(`${CACHE_PREFIX_CATALOG}${category}`, JSON.stringify(bucket));
      await this.updateMeta(category, capped.length, now);
    } catch {
      // Ignorar fallo de cuota en AsyncStorage sin interrumpir flujo
    }
  }

  public async getSatellite(
    noradId: number
  ): Promise<{ bucket: CacheBucket<SatelliteOrbitalData>; isExpired: boolean } | null> {
    try {
      const raw = await AsyncStorage.getItem(`${CACHE_PREFIX_SAT}${noradId}`);
      if (!raw) return null;
      const bucket = JSON.parse(raw) as CacheBucket<SatelliteOrbitalData>;
      const isExpired = this.isExpired(bucket.fetchedAtMs, bucket.ttlHours || this.defaultTtlHours);
      return { bucket, isExpired };
    } catch {
      return null;
    }
  }

  public async setSatellite(
    satellite: SatelliteOrbitalData,
    providerId: DataProviderId,
    ttlHours: number = this.defaultTtlHours
  ): Promise<void> {
    try {
      const bucket: CacheBucket<SatelliteOrbitalData> = {
        data: satellite,
        fetchedAtMs: Date.now(),
        ttlHours,
        providerId,
      };
      await AsyncStorage.setItem(`${CACHE_PREFIX_SAT}${satellite.noradId}`, JSON.stringify(bucket));
    } catch {
      // No-op
    }
  }

  private async updateMeta(
    category: ConstellationCategory,
    count: number,
    timestampMs: number
  ): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(CACHE_META_KEY);
      const current = raw
        ? (JSON.parse(raw) as {
            categories: Record<string, { count: number; updatedAt: number }>;
          })
        : { categories: {} };
      current.categories[category] = { count, updatedAt: timestampMs };
      await AsyncStorage.setItem(CACHE_META_KEY, JSON.stringify(current));
    } catch {
      // No-op
    }
  }

  public async getStats(): Promise<CacheStats> {
    try {
      const raw = await AsyncStorage.getItem(CACHE_META_KEY);
      if (!raw) {
        return {
          cachedCategories: [],
          totalCachedSatellites: 0,
          lastUpdatedAtMs: null,
          ttlHours: this.defaultTtlHours,
        };
      }
      const parsed = JSON.parse(raw) as {
        categories: Record<string, { count: number; updatedAt: number }>;
      };
      const keys = Object.keys(parsed.categories) as ConstellationCategory[];
      let total = 0;
      let latest: number | null = null;
      for (const k of keys) {
        total += parsed.categories[k].count;
        if (!latest || parsed.categories[k].updatedAt > latest) {
          latest = parsed.categories[k].updatedAt;
        }
      }
      return {
        cachedCategories: keys,
        totalCachedSatellites: total,
        lastUpdatedAtMs: latest,
        ttlHours: this.defaultTtlHours,
      };
    } catch {
      return {
        cachedCategories: [],
        totalCachedSatellites: 0,
        lastUpdatedAtMs: null,
        ttlHours: this.defaultTtlHours,
      };
    }
  }

  public async clearAll(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const targetKeys = keys.filter(
        (k) =>
          k.startsWith(CACHE_PREFIX_CATALOG) ||
          k.startsWith(CACHE_PREFIX_SAT) ||
          k === CACHE_META_KEY
      );
      if (targetKeys.length > 0) {
        await AsyncStorage.multiRemove(targetKeys);
      }
    } catch {
      // No-op
    }
  }
}

export const orbitalCache = new OrbitalCacheManager();

