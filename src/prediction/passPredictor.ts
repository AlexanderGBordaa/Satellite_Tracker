import { computeLookAngles, propagateSubsatellitePoint } from '../orbital/orbitalEngine';
import type {
  ObserverLocation,
  PassWindow,
  SatelliteOrbitalData,
  SkyTrackPoint,
} from '../types/orbital';

const GOLDEN_RATIO_CONJUGATE = (Math.sqrt(5) - 1) / 2; // ~0.6180339887

/**
 * Evalúa rápido la elevación, azimut y rango en un instante t (ms).
 */
function sampleAnglesAt(
  orbital: SatelliteOrbitalData,
  observer: ObserverLocation,
  timestampMs: number
): { elevationDeg: number; azimuthDeg: number; rangeKm: number } | null {
  const sub = propagateSubsatellitePoint(orbital, new Date(timestampMs));
  if (!sub) return null;
  const look = computeLookAngles(sub, observer, 0);
  return {
    elevationDeg: look.elevationDeg,
    azimuthDeg: look.azimuthDeg,
    rangeKm: look.rangeSatKm,
  };
}

/**
 * Refinamiento fino por bisección (8 iteraciones -> resolución < 0.2 s a partir de un paso de 45 s)
 * para hallar el cruce exacto del umbral de horizonte (AOS o LOS).
 */
function refineHorizonCrossing(
  orbital: SatelliteOrbitalData,
  observer: ObserverLocation,
  tLowMs: number,
  tHighMs: number,
  targetElevationDeg: number = 0,
  iterations: number = 8
): { timeMs: number; azimuthDeg: number; elevationDeg: number; rangeKm: number } {
  let a = tLowMs;
  let b = tHighMs;
  const sampleA = sampleAnglesAt(orbital, observer, a);
  let fa = (sampleA?.elevationDeg ?? -90) - targetElevationDeg;

  let bestSample = sampleA ?? { elevationDeg: 0, azimuthDeg: 0, rangeKm: 1000 };
  let mid = Math.round((a + b) / 2);

  for (let i = 0; i < iterations; i++) {
    mid = Math.round((a + b) / 2);
    const sMid = sampleAnglesAt(orbital, observer, mid);
    if (!sMid) break;
    bestSample = sMid;
    const fMid = sMid.elevationDeg - targetElevationDeg;

    if (Math.abs(fMid) < 0.02) {
      break;
    }
    if ((fa <= 0 && fMid >= 0) || (fa >= 0 && fMid <= 0)) {
      b = mid;
    } else {
      a = mid;
      fa = fMid;
    }
  }

  return {
    timeMs: mid,
    azimuthDeg: bestSample.azimuthDeg,
    elevationDeg: bestSample.elevationDeg,
    rangeKm: bestSample.rangeKm,
  };
}

/**
 * Búsqueda de sección áurea (Golden-Section Search) para encontrar el máximo exacto
 * de elevación (TCA / Max Elevation) dentro del intervalo [aosMs, losMs].
 */
function refineMaxElevation(
  orbital: SatelliteOrbitalData,
  observer: ObserverLocation,
  aosMs: number,
  losMs: number,
  iterations: number = 10
): { timeMs: number; maxElevationDeg: number; azimuthDeg: number; minRangeKm: number } {
  let a = aosMs;
  let b = losMs;
  let c = b - GOLDEN_RATIO_CONJUGATE * (b - a);
  let d = a + GOLDEN_RATIO_CONJUGATE * (b - a);

  let sc = sampleAnglesAt(orbital, observer, c);
  let sd = sampleAnglesAt(orbital, observer, d);

  for (let i = 0; i < iterations; i++) {
    const elC = sc?.elevationDeg ?? -90;
    const elD = sd?.elevationDeg ?? -90;

    if (elC > elD) {
      b = d;
      d = c;
      sd = sc;
      c = b - GOLDEN_RATIO_CONJUGATE * (b - a);
      sc = sampleAnglesAt(orbital, observer, c);
    } else {
      a = c;
      c = d;
      sc = sd;
      d = a + GOLDEN_RATIO_CONJUGATE * (b - a);
      sd = sampleAnglesAt(orbital, observer, d);
    }
  }

  const peakTimeMs = Math.round((a + b) / 2);
  const peakSample = sampleAnglesAt(orbital, observer, peakTimeMs) ?? {
    elevationDeg: 0,
    azimuthDeg: 0,
    rangeKm: 0,
  };

  return {
    timeMs: peakTimeMs,
    maxElevationDeg: peakSample.elevationDeg,
    azimuthDeg: peakSample.azimuthDeg,
    minRangeKm: peakSample.rangeKm,
  };
}

/**
 * Genera los puntos polares (Azimut, Elevación) de la trayectoria del pase
 * desde AOS hasta LOS para renderizar en el Sky Chart SVG (RF-05).
 */
export function buildPassSkyTrack(
  orbital: SatelliteOrbitalData,
  observer: ObserverLocation,
  aosMs: number,
  losMs: number,
  numSamples: number = 32
): SkyTrackPoint[] {
  const durationMs = Math.max(1000, losMs - aosMs);
  const stepMs = durationMs / Math.max(4, numSamples - 1);
  const points: SkyTrackPoint[] = [];

  for (let i = 0; i < numSamples; i++) {
    const t = i === numSamples - 1 ? losMs : Math.round(aosMs + i * stepMs);
    const sample = sampleAnglesAt(orbital, observer, t);
    if (sample) {
      points.push({
        timestampMs: t,
        azimuthDeg: sample.azimuthDeg,
        elevationDeg: Math.max(0, sample.elevationDeg),
        rangeKm: sample.rangeKm,
      });
    }
  }

  return points;
}

/**
 * Algoritmo de predicción de ventanas de visibilidad en dos etapas (Grueso -> Fino).
 *
 * 1. Etapa Gruesa: avanza con paso adaptativo (40 s cerca del horizonte, 90 s cuando
 *    la elevación es < -25°) reduciendo en ~15x las llamadas a SGP4 respecto a un barrido naive.
 * 2. Etapa Fina: al detectar cruce de 0° de elevación, aplica bisección para AOS y LOS
 *    (precisión < 0.2 s) y búsqueda de sección áurea para TCA / Elevación Máxima.
 * 3. Filtra aquellos pases cuya elevación máxima supere `minMaxElevationDeg`.
 */
export function predictUpcomingPasses(
  orbital: SatelliteOrbitalData,
  observer: ObserverLocation,
  options: {
    startDate?: Date;
    hoursAhead?: number;
    minMaxElevationDeg?: number;
    maxPasses?: number;
  } = {}
): PassWindow[] {
  const startDate = options.startDate ?? new Date();
  const hoursAhead = options.hoursAhead ?? 24;
  const minMaxElevationDeg = options.minMaxElevationDeg ?? 10;
  const maxPasses = options.maxPasses ?? 8;

  // Para satélites geoestacionarios (GEO), su posición relativa al observador es cuasi-estática
  if (orbital.orbitRegime === 'GEO') {
    const nowMs = startDate.getTime();
    const currentSample = sampleAnglesAt(orbital, observer, nowMs);
    if (currentSample && currentSample.elevationDeg >= minMaxElevationDeg) {
      const endMs = nowMs + 24 * 3600 * 1000;
      return [
        {
          id: `${orbital.noradId}-geo-${nowMs}`,
          noradId: orbital.noradId,
          satelliteName: orbital.name,
          aosTimeMs: nowMs,
          aosAzimuthDeg: currentSample.azimuthDeg,
          tcaTimeMs: nowMs + 12 * 3600 * 1000,
          maxElevationDeg: currentSample.elevationDeg,
          tcaAzimuthDeg: currentSample.azimuthDeg,
          minRangeKm: currentSample.rangeKm,
          losTimeMs: endMs,
          losAzimuthDeg: currentSample.azimuthDeg,
          durationSeconds: 24 * 3600,
          skyTrack: buildPassSkyTrack(orbital, observer, nowMs, nowMs + 3600 * 1000, 12),
        },
      ];
    }
    return [];
  }

  const startMs = startDate.getTime();
  const endMs = startMs + hoursAhead * 3600 * 1000;
  const baseStepMs = orbital.orbitRegime === 'LEO' ? 40 * 1000 : 120 * 1000;
  const deepBelowHorizonStepMs = orbital.orbitRegime === 'LEO' ? 90 * 1000 : 240 * 1000;

  const passes: PassWindow[] = [];

  let prevTimeMs = startMs;
  let prevSample = sampleAnglesAt(orbital, observer, prevTimeMs);
  if (!prevSample) return [];

  // Si al iniciar la búsqueda el satélite ya está sobre el horizonte, retrocedemos hasta 25 min para hallar su AOS real
  let activeAos: { timeMs: number; azimuthDeg: number } | null = null;
  if (prevSample.elevationDeg > 0) {
    let lookbackMs = startMs;
    const minLookbackMs = startMs - 30 * 60 * 1000;
    while (lookbackMs > minLookbackMs) {
      const earlierMs = lookbackMs - baseStepMs;
      const earlierSample = sampleAnglesAt(orbital, observer, earlierMs);
      if (!earlierSample || earlierSample.elevationDeg <= 0) {
        const refined = refineHorizonCrossing(orbital, observer, earlierMs, lookbackMs, 0);
        activeAos = { timeMs: refined.timeMs, azimuthDeg: refined.azimuthDeg };
        break;
      }
      lookbackMs = earlierMs;
    }
    if (!activeAos) {
      activeAos = { timeMs: startMs, azimuthDeg: prevSample.azimuthDeg };
    }
  }

  let currentMs = startMs + baseStepMs;

  while (currentMs <= endMs && passes.length < maxPasses) {
    const currSample = sampleAnglesAt(orbital, observer, currentMs);
    if (!currSample) {
      currentMs += baseStepMs;
      continue;
    }

    // Cruce ascendente del horizonte -> AOS
    if (prevSample.elevationDeg <= 0 && currSample.elevationDeg > 0 && !activeAos) {
      const refinedAos = refineHorizonCrossing(orbital, observer, prevTimeMs, currentMs, 0);
      activeAos = {
        timeMs: refinedAos.timeMs,
        azimuthDeg: refinedAos.azimuthDeg,
      };
    }

    // Cruce descendente del horizonte -> LOS
    if (prevSample.elevationDeg > 0 && currSample.elevationDeg <= 0 && activeAos) {
      const refinedLos = refineHorizonCrossing(orbital, observer, prevTimeMs, currentMs, 0);
      const peak = refineMaxElevation(orbital, observer, activeAos.timeMs, refinedLos.timeMs);

      if (peak.maxElevationDeg >= minMaxElevationDeg) {
        const durationSeconds = Math.max(
          1,
          Math.round((refinedLos.timeMs - activeAos.timeMs) / 1000)
        );
        const skyTrack = buildPassSkyTrack(
          orbital,
          observer,
          activeAos.timeMs,
          refinedLos.timeMs,
          32
        );

        passes.push({
          id: `${orbital.noradId}-${activeAos.timeMs}`,
          noradId: orbital.noradId,
          satelliteName: orbital.name,
          aosTimeMs: activeAos.timeMs,
          aosAzimuthDeg: activeAos.azimuthDeg,
          tcaTimeMs: peak.timeMs,
          maxElevationDeg: peak.maxElevationDeg,
          tcaAzimuthDeg: peak.azimuthDeg,
          minRangeKm: peak.minRangeKm,
          losTimeMs: refinedLos.timeMs,
          losAzimuthDeg: refinedLos.azimuthDeg,
          durationSeconds,
          skyTrack,
        });
      }

      activeAos = null;
    }

    prevTimeMs = currentMs;
    prevSample = currSample;

    // Salto adaptativo: si el satélite está muy por debajo del horizonte (< -25°), damos un paso mayor
    if (!activeAos && currSample.elevationDeg < -25) {
      currentMs += deepBelowHorizonStepMs;
    } else {
      currentMs += baseStepMs;
    }
  }

  return passes;
}

