import {
  degreesLat,
  degreesLong,
  degreesToRadians,
  ecfToLookAngles,
  eciToEcf,
  eciToGeodetic,
  geodeticToEcf,
  gstime,
  json2satrec,
  propagate,
  radiansToDegrees,
  twoline2satrec,
  type SatRec,
} from 'satellite.js';
import type {
  GroundTrackSegment,
  ObserverLocation,
  OrbitRegime,
  SatelliteOrbitalData,
  SatelliteTelemetry,
  SubsatellitePoint,
  TopocentricLookAngles,
} from '../types/orbital';

export const EARTH_RADIUS_KM = 6378.137; // WGS-84 radio ecuatorial (km)
const SPEED_OF_LIGHT_KM_S = 299792.458;

/**
 * Caché en memoria de estructuras SatRec compiladas para evitar re-parsear
 * OMM/TLE en cada tick de UI o durante la búsqueda de pases y constelaciones.
 */
const satRecCache = new Map<string, SatRec>();

function getCacheKey(orbital: SatelliteOrbitalData): string {
  return `${orbital.noradId}:${orbital.epochIso}`;
}

/**
 * Obtiene o inicializa el registro SatRec de SGP4/SDP4.
 * Prioriza formato OMM/JSON (json2satrec) para soportar NORAD IDs de 6 dígitos
 * y recurre a TLE clásico (twoline2satrec) cuando proviene de fuentes TLE.
 */
export function getSatRec(orbital: SatelliteOrbitalData): SatRec {
  const key = getCacheKey(orbital);
  const cached = satRecCache.get(key);
  if (cached) {
    return cached;
  }

  let satrec: SatRec;
  if (orbital.omm) {
    satrec = json2satrec(orbital.omm);
  } else if (orbital.tle) {
    satrec = twoline2satrec(orbital.tle.line1, orbital.tle.line2);
  } else {
    throw new Error(`El satélite ${orbital.noradId} (${orbital.name}) no posee datos OMM ni TLE.`);
  }

  // Limitar tamaño máximo del caché en memoria
  if (satRecCache.size > 1500) {
    const firstKey = satRecCache.keys().next().value;
    if (firstKey) satRecCache.delete(firstKey);
  }
  satRecCache.set(key, satrec);
  return satrec;
}

/**
 * Clasifica el régimen orbital según el movimiento medio (rev/día) y excentricidad.
 */
export function classifyOrbitRegime(meanMotionRevPerDay: number, eccentricity: number): OrbitRegime {
  if (eccentricity >= 0.25) {
    return 'HEO';
  }
  if (meanMotionRevPerDay >= 11.25) {
    return 'LEO'; // Período <= 128 min (altitud < ~2000 km)
  }
  if (meanMotionRevPerDay >= 0.9 && meanMotionRevPerDay <= 1.1) {
    return 'GEO'; // Período ~24 h (~35.786 km)
  }
  return 'MEO'; // Ej. GPS (~2 rev/día, ~20.200 km)
}

/**
 * Propaga la órbita del satélite en el instante `date` usando SGP4/SDP4 y devuelve
 * el punto subsatelital geodésico (latitud, longitud, altitud) y vectores ECI.
 */
export function propagateSubsatellitePoint(
  orbital: SatelliteOrbitalData,
  date: Date
): SubsatellitePoint | null {
  try {
    const satrec = getSatRec(orbital);
    const pv = propagate(satrec, date);
    if (!pv || !pv.position || !pv.velocity) {
      return null;
    }

    const gmst = gstime(date);
    const geodetic = eciToGeodetic(pv.position, gmst);

    const latitudeDeg = degreesLat(geodetic.latitude);
    const longitudeDeg = degreesLong(geodetic.longitude);
    const altitudeKm = geodetic.height;

    const vx = pv.velocity.x;
    const vy = pv.velocity.y;
    const vz = pv.velocity.z;
    const velocityKmPerSec = Math.sqrt(vx * vx + vy * vy + vz * vz);

    if (
      Number.isNaN(latitudeDeg) ||
      Number.isNaN(longitudeDeg) ||
      Number.isNaN(altitudeKm) ||
      altitudeKm < 50
    ) {
      return null;
    }

    return {
      noradId: orbital.noradId,
      timestampMs: date.getTime(),
      latitudeDeg,
      longitudeDeg,
      altitudeKm,
      velocityKmPerSec,
      eciPositionKm: {
        x: pv.position.x,
        y: pv.position.y,
        z: pv.position.z,
      },
      eciVelocityKmPerSec: {
        x: vx,
        y: vy,
        z: vz,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Calcula las coordenadas topocéntricas (Azimut, Elevación, Rango y velocidad radial/Doppler)
 * respecto a la posición geodésica del observador terrestre.
 */
export function computeLookAngles(
  subsatellite: SubsatellitePoint,
  observer: ObserverLocation,
  minElevationDeg: number = 10
): TopocentricLookAngles {
  const date = new Date(subsatellite.timestampMs);
  const gmst = gstime(date);

  const observerGeodetic = {
    latitude: degreesToRadians(observer.latitudeDeg),
    longitude: degreesToRadians(observer.longitudeDeg),
    height: observer.altitudeMeters / 1000,
  };

  const satEcf = eciToEcf(subsatellite.eciPositionKm, gmst);
  const lookAngles = ecfToLookAngles(observerGeodetic, satEcf);

  const azimuthDeg = radiansToDegrees(lookAngles.azimuth);
  const elevationDeg = radiansToDegrees(lookAngles.elevation);
  const rangeSatKm = lookAngles.rangeSat;

  // Cálculo de velocidad radial aproximada (range rate) proyectando la velocidad relativa en ECEF
  const obsEcf = geodeticToEcf(observerGeodetic);
  const rx = satEcf.x - obsEcf.x;
  const ry = satEcf.y - obsEcf.y;
  const rz = satEcf.z - obsEcf.z;
  const rNorm = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;

  // Velocidad del satélite corregida por rotación terrestre (omega_E = 7.292115e-5 rad/s)
  const omegaEarth = 7.292115e-5;
  const velEcf = eciToEcf(subsatellite.eciVelocityKmPerSec, gmst);
  const vxRel = velEcf.x + omegaEarth * satEcf.y;
  const vyRel = velEcf.y - omegaEarth * satEcf.x;
  const vzRel = velEcf.z;

  const rangeRateKmPerSec = (rx * vxRel + ry * vyRel + rz * vzRel) / rNorm;
  // Desplazamiento Doppler para enlace descendente de referencia en 10 GHz (banda X/Ku)
  const dopplerShiftHzAt10GHz = -10e9 * (rangeRateKmPerSec / SPEED_OF_LIGHT_KM_S);

  return {
    azimuthDeg: (azimuthDeg + 360) % 360,
    elevationDeg,
    rangeSatKm,
    rangeRateKmPerSec,
    dopplerShiftHzAt10GHz,
    isVisibleAboveHorizon: elevationDeg > 0,
    isAboveMinElevation: elevationDeg >= minElevationDeg,
  };
}

/**
 * Calcula el radio superficial del área de cobertura (Footprint) de un satélite
 * a altitud `altitudeKm` para un ángulo de elevación mínima operativa `minElevationDeg`.
 *
 * Ecuación trigonométrica esférica:
 *   eta = arcsin((R_E / (R_E + h)) * cos(el_min))
 *   lambda = (pi / 2) - el_min - eta
 *   radio_superficial = R_E * lambda
 */
export function computeFootprintRadiusKm(
  altitudeKm: number,
  minElevationDeg: number = 0
): number {
  if (altitudeKm <= 0) return 0;
  const clampedElDeg = Math.max(0, Math.min(89, minElevationDeg));
  const elRad = degreesToRadians(clampedElDeg);

  const ratio = (EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitudeKm)) * Math.cos(elRad);
  const clampedRatio = Math.min(1, Math.max(-1, ratio));
  const nadirAngleRad = Math.asin(clampedRatio);
  const centralAngleRad = Math.PI / 2 - elRad - nadirAngleRad;

  return Math.max(0, EARTH_RADIUS_KM * centralAngleRad);
}

/**
 * Calcula toda la telemetría instantánea del satélite seleccionado (RF-02, RF-03, RF-12, RF-16).
 */
export function computeSatelliteTelemetry(
  orbital: SatelliteOrbitalData,
  observer: ObserverLocation,
  date: Date = new Date(),
  minElevationDeg: number = 10,
  staleThresholdHours: number = 24
): SatelliteTelemetry | null {
  const subsatellite = propagateSubsatellitePoint(orbital, date);
  if (!subsatellite) return null;

  const lookAngles = computeLookAngles(subsatellite, observer, minElevationDeg);
  const footprintRadiusKm = computeFootprintRadiusKm(subsatellite.altitudeKm, minElevationDeg);

  const ageHours = Math.max(0, (date.getTime() - orbital.epochTimestampMs) / (1000 * 3600));

  return {
    orbital,
    subsatellite,
    lookAngles,
    footprintRadiusKm,
    orbitalDataAgeHours: ageHours,
    isDataStale: ageHours > staleThresholdHours,
  };
}

/**
 * Genera el Ground Track (trayectoria pasada y futura de al menos una órbita completa)
 * y resuelve el cruce del antimeridiano (±180° de longitud) dividiendo la polilínea
 * en segmentos limpios con interpolación lineal en el borde ±180° (RF-11).
 */
export function computeGroundTrackSegments(
  orbital: SatelliteOrbitalData,
  referenceDate: Date = new Date(),
  stepSeconds?: number
): GroundTrackSegment[] {
  const periodMin = Math.max(85, Math.min(1440, orbital.periodMinutes || 95));
  // Paso adaptativo: 40 s para LEO (~95 min), mayor para MEO/GEO para mantener ~180 puntos por órbita
  const effectiveStepSec =
    stepSeconds ?? (orbital.orbitRegime === 'LEO' ? 40 : Math.round((periodMin * 60) / 160));

  // Cubrimos media órbita hacia el pasado y 1 órbita completa hacia el futuro (total 1.5 órbitas)
  const pastDurationMs = Math.round(periodMin * 0.5 * 60 * 1000);
  const futureDurationMs = Math.round(periodMin * 1.05 * 60 * 1000);
  const refMs = referenceDate.getTime();
  const stepMs = effectiveStepSec * 1000;

  const segments: GroundTrackSegment[] = [];

  const buildBranchSegments = (
    startMs: number,
    endMs: number,
    isPast: boolean,
    prefix: string
  ) => {
    let currentCoords: Array<{ latitude: number; longitude: number }> = [];
    let segmentIndex = 0;
    let prevLat: number | null = null;
    let prevLon: number | null = null;

    for (let t = startMs; t <= endMs; t += stepMs) {
      const point = propagateSubsatellitePoint(orbital, new Date(t));
      if (!point) continue;

      const lat = point.latitudeDeg;
      const lon = point.longitudeDeg;

      if (prevLon !== null && prevLat !== null) {
        const deltaLon = lon - prevLon;

        // Si el salto de longitud entre muestras consecutivas supera 180°,
        // el satélite cruzó el antimeridiano (+180° <-> -180°).
        if (Math.abs(deltaLon) > 180) {
          // Interpolación del punto exacto de cruce en el meridiano ±180°
          const boundaryLon = prevLon > 0 ? 180 : -180;
          const wrappedLon = prevLon > 0 ? lon + 360 : lon - 360;
          const fraction =
            Math.abs(wrappedLon - prevLon) > 1e-6
              ? (boundaryLon - prevLon) / (wrappedLon - prevLon)
              : 0.5;
          const crossingLat = prevLat + fraction * (lat - prevLat);

          currentCoords.push({
            latitude: crossingLat,
            longitude: boundaryLon,
          });

          if (currentCoords.length >= 2) {
            segments.push({
              id: `${prefix}-${segmentIndex++}`,
              isPast,
              coordinates: currentCoords,
            });
          }

          // Nuevo segmento desde el meridiano opuesto (-180° o +180°)
          currentCoords = [
            {
              latitude: crossingLat,
              longitude: -boundaryLon,
            },
          ];
        }
      }

      currentCoords.push({ latitude: lat, longitude: lon });
      prevLat = lat;
      prevLon = lon;
    }

    if (currentCoords.length >= 2) {
      segments.push({
        id: `${prefix}-${segmentIndex++}`,
        isPast,
        coordinates: currentCoords,
      });
    }
  };

  buildBranchSegments(refMs - pastDurationMs, refMs, true, 'past');
  buildBranchSegments(refMs, refMs + futureDurationMs, false, 'future');

  return segments;
}

/**
 * Propaga en lote un conjunto de satélites (p. ej. constelación Starlink)
 * con límite máximo de objetos para preservar 60 FPS en el hilo de UI (RF-13).
 */
export function propagateConstellationBatch(
  satellites: SatelliteOrbitalData[],
  date: Date = new Date(),
  maxCount: number = 60
): SubsatellitePoint[] {
  const results: SubsatellitePoint[] = [];
  const limit = Math.min(satellites.length, maxCount);

  for (let i = 0; i < limit; i++) {
    const pos = propagateSubsatellitePoint(satellites[i], date);
    if (pos) {
      results.push(pos);
    }
  }
  return results;
}

/**
 * Calcula la distancia geodésica sobre la superficie terrestre (fórmula de Haversine)
 * y el error espacial tridimensional en ECEF entre dos posiciones (RF-15).
 */
export function computePositionErrorMetrics(
  local: { latitudeDeg: number; longitudeDeg: number; altitudeKm: number },
  external: { latitudeDeg: number; longitudeDeg: number; altitudeKm: number }
): {
  surfaceDistanceErrorKm: number;
  altitudeErrorKm: number;
  spatial3DErrorKm: number;
  latitudeDiffDeg: number;
  longitudeDiffDeg: number;
} {
  const lat1 = degreesToRadians(local.latitudeDeg);
  const lon1 = degreesToRadians(local.longitudeDeg);
  const lat2 = degreesToRadians(external.latitudeDeg);
  const lon2 = degreesToRadians(external.longitudeDeg);

  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  const surfaceDistanceErrorKm = EARTH_RADIUS_KM * c;

  const altitudeErrorKm = Math.abs(local.altitudeKm - external.altitudeKm);

  const ecfLocal = geodeticToEcf({
    latitude: lat1,
    longitude: lon1,
    height: local.altitudeKm,
  });
  const ecfExternal = geodeticToEcf({
    latitude: lat2,
    longitude: lon2,
    height: external.altitudeKm,
  });

  const dx = ecfLocal.x - ecfExternal.x;
  const dy = ecfLocal.y - ecfExternal.y;
  const dz = ecfLocal.z - ecfExternal.z;
  const spatial3DErrorKm = Math.sqrt(dx * dx + dy * dy + dz * dz);

  return {
    surfaceDistanceErrorKm,
    altitudeErrorKm,
    spatial3DErrorKm,
    latitudeDiffDeg: local.latitudeDeg - external.latitudeDeg,
    longitudeDiffDeg: local.longitudeDeg - external.longitudeDeg,
  };
}

