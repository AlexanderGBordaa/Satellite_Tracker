import type { DataProviderId, RateLimiterStatus } from '../types/orbital';

interface ProviderRateConfig {
  maxPerMinute: number;
  maxPerHour: number;
  minIntervalMs: number;
}

/**
 * Configuración de límites de tasa por proveedor según Sección 4.2 del TP:
 * - CelesTrak: revisa fuentes 1 vez/día, impone bloqueos ante scraping agresivo -> límite conservador.
 * - Space-Track.org: Guía oficial < 30 requests/min y < 300 requests/hora.
 * - N2YO: 1.000 transacciones/hora (TLE/posiciones) y 100/hora (pases).
 * - Where the ISS at?: ~1 request/segundo sin autenticación.
 */
const PROVIDER_LIMITS: Record<DataProviderId, ProviderRateConfig> = {
  celestrak: {
    maxPerMinute: 12,
    maxPerHour: 100,
    minIntervalMs: 800,
  },
  spacetrack: {
    maxPerMinute: 25, // Estricto < 30 req/min
    maxPerHour: 250, // Estricto < 300 req/hora
    minIntervalMs: 1200,
  },
  n2yo: {
    maxPerMinute: 30,
    maxPerHour: 800, // < 1000 transacciones/hora
    minIntervalMs: 500,
  },
  wheretheiss: {
    maxPerMinute: 45, // <= 1 req/s
    maxPerHour: 1200,
    minIntervalMs: 1050,
  },
  'offline-seed': {
    maxPerMinute: 9999,
    maxPerHour: 99999,
    minIntervalMs: 0,
  },
};

interface ProviderRuntimeState {
  timestampsMs: number[];
  lastRequestMs: number;
  backoffUntilMs: number;
  totalRequests: number;
  totalThrottled: number;
}

class RateLimiterManager {
  private states: Record<DataProviderId, ProviderRuntimeState> = {
    celestrak: { timestampsMs: [], lastRequestMs: 0, backoffUntilMs: 0, totalRequests: 0, totalThrottled: 0 },
    spacetrack: { timestampsMs: [], lastRequestMs: 0, backoffUntilMs: 0, totalRequests: 0, totalThrottled: 0 },
    n2yo: { timestampsMs: [], lastRequestMs: 0, backoffUntilMs: 0, totalRequests: 0, totalThrottled: 0 },
    wheretheiss: { timestampsMs: [], lastRequestMs: 0, backoffUntilMs: 0, totalRequests: 0, totalThrottled: 0 },
    'offline-seed': { timestampsMs: [], lastRequestMs: 0, backoffUntilMs: 0, totalRequests: 0, totalThrottled: 0 },
  };

  private pruneWindow(providerId: DataProviderId, nowMs: number): void {
    const state = this.states[providerId];
    const oneHourAgo = nowMs - 3600 * 1000;
    state.timestampsMs = state.timestampsMs.filter((t) => t > oneHourAgo);
  }

  /**
   * Obtiene métricas actuales de uso para mostrar en el panel de estado de APIs.
   */
  public getStatus(providerId: DataProviderId): RateLimiterStatus {
    const nowMs = Date.now();
    this.pruneWindow(providerId, nowMs);
    const state = this.states[providerId];
    const cfg = PROVIDER_LIMITS[providerId];
    const oneMinAgo = nowMs - 60 * 1000;
    const requestsInLastMinute = state.timestampsMs.filter((t) => t > oneMinAgo).length;

    return {
      providerId,
      requestsInLastMinute,
      maxPerMinute: cfg.maxPerMinute,
      requestsInLastHour: state.timestampsMs.length,
      maxPerHour: cfg.maxPerHour,
      backoffUntilMs: state.backoffUntilMs,
      totalRequests: state.totalRequests,
      totalThrottled: state.totalThrottled,
    };
  }

  public getAllStatuses(): RateLimiterStatus[] {
    return (['celestrak', 'spacetrack', 'n2yo', 'wheretheiss'] as DataProviderId[]).map((id) =>
      this.getStatus(id)
    );
  }

  /**
   * Ejecuta una operación HTTP respetando la cuota del proveedor y aplicando
   * cola de reintentos con backoff exponencial y jitter ante errores transitorios o HTTP 429.
   */
  public async schedule<T>(
    providerId: DataProviderId,
    task: () => Promise<T>,
    maxRetries: number = 2
  ): Promise<T> {
    const cfg = PROVIDER_LIMITS[providerId];
    const state = this.states[providerId];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const nowMs = Date.now();
      this.pruneWindow(providerId, nowMs);

      if (state.backoffUntilMs > nowMs) {
        const waitBackoff = state.backoffUntilMs - nowMs;
        if (waitBackoff > 8000) {
          state.totalThrottled++;
          throw new Error(
            `Proveedor ${providerId} en período de backoff por ${Math.ceil(waitBackoff / 1000)}s.`
          );
        }
        await this.sleep(waitBackoff);
      }

      const oneMinAgo = Date.now() - 60 * 1000;
      const countLastMin = state.timestampsMs.filter((t) => t > oneMinAgo).length;
      const countLastHour = state.timestampsMs.length;

      if (countLastMin >= cfg.maxPerMinute || countLastHour >= cfg.maxPerHour) {
        state.totalThrottled++;
        throw new Error(
          `Límite de tasa alcanzado para ${providerId} (${countLastMin}/${cfg.maxPerMinute} req/min, ${countLastHour}/${cfg.maxPerHour} req/h).`
        );
      }

      const elapsedSinceLast = Date.now() - state.lastRequestMs;
      if (elapsedSinceLast < cfg.minIntervalMs) {
        await this.sleep(cfg.minIntervalMs - elapsedSinceLast);
      }

      try {
        const reqTime = Date.now();
        state.lastRequestMs = reqTime;
        state.timestampsMs.push(reqTime);
        state.totalRequests++;

        return await task();
      } catch (err: unknown) {
        const isLastAttempt = attempt === maxRetries;
        const message = err instanceof Error ? err.message : String(err);

        // Si el error es de credenciales faltantes, no reintentar
        if (message.includes('NO_CREDENTIALS') || message.includes('401') || message.includes('403')) {
          throw err;
        }

        // Backoff exponencial: base 1.2s * 2^attempt + jitter aleatorio (0-300 ms)
        const backoffMs = Math.round(1200 * Math.pow(2, attempt) + Math.random() * 300);
        state.backoffUntilMs = Date.now() + backoffMs;

        if (isLastAttempt) {
          throw err;
        }
      }
    }

    throw new Error(`Fallo tras ${maxRetries + 1} intentos en ${providerId}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const rateLimiter = new RateLimiterManager();

