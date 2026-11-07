import { classifyOrbitRegime } from '../orbital/orbitalEngine';
import type {
  ConstellationCategory,
  DataProviderId,
  OMMRecord,
  SatelliteOrbitalData,
} from '../types/orbital';

/**
 * Parsea la fecha EPOCH de un registro OMM (ej. "2026-11-07T12:34:56.789000") en UTC.
 */
export function parseOmmEpochMs(epochStr: string): number {
  const normalized = epochStr.endsWith('Z') ? epochStr : `${epochStr}Z`;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

/**
 * Parsea la fecha EPOCH de la línea 1 de un TLE (columnas 19-32: YYDDD.DDDDDDDD).
 */
export function parseTleEpochMs(line1: string): { epochIso: string; epochTimestampMs: number } {
  try {
    const epochField = line1.substring(18, 32).trim();
    const twoDigitYear = parseInt(epochField.substring(0, 2), 10);
    const dayOfYearFraction = parseFloat(epochField.substring(2));
    const fullYear = twoDigitYear >= 57 ? 1900 + twoDigitYear : 2000 + twoDigitYear;

    const jan1UtcMs = Date.UTC(fullYear, 0, 1, 0, 0, 0, 0);
    const epochTimestampMs = Math.round(
      jan1UtcMs + (dayOfYearFraction - 1) * 24 * 3600 * 1000
    );
    const epochIso = new Date(epochTimestampMs).toISOString();
    return { epochIso, epochTimestampMs };
  } catch {
    const now = Date.now();
    return { epochIso: new Date(now).toISOString(), epochTimestampMs: now };
  }
}

/**
 * Convierte un objeto JSON OMM (CelesTrak o Space-Track) en `SatelliteOrbitalData`.
 */
export function normalizeOmmRecord(
  raw: Record<string, unknown>,
  category: ConstellationCategory,
  provider: DataProviderId,
  fetchedAtMs: number = Date.now()
): SatelliteOrbitalData | null {
  const noradId = Number(raw.NORAD_CAT_ID);
  const name = String(raw.OBJECT_NAME ?? `SAT ${noradId}`).trim();
  const epochRaw = String(raw.EPOCH ?? '');
  if (!noradId || !epochRaw) return null;

  const meanMotion = Number(raw.MEAN_MOTION ?? 15.0);
  const eccentricity = Number(raw.ECCENTRICITY ?? 0);
  const inclination = Number(raw.INCLINATION ?? 0);
  const raan = Number(raw.RA_OF_ASC_NODE ?? 0);
  const argPericenter = Number(raw.ARG_OF_PERICENTER ?? 0);
  const meanAnomaly = Number(raw.MEAN_ANOMALY ?? 0);
  const bstar = Number(raw.BSTAR ?? 0);
  const meanMotionDot = Number(raw.MEAN_MOTION_DOT ?? 0);
  const meanMotionDdot = Number(raw.MEAN_MOTION_DDOT ?? 0);

  const omm: OMMRecord = {
    OBJECT_NAME: name,
    OBJECT_ID: String(raw.OBJECT_ID ?? ''),
    EPOCH: epochRaw.replace(/Z$/, ''),
    MEAN_MOTION: meanMotion,
    ECCENTRICITY: eccentricity,
    INCLINATION: inclination,
    RA_OF_ASC_NODE: raan,
    ARG_OF_PERICENTER: argPericenter,
    MEAN_ANOMALY: meanAnomaly,
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: 'U',
    NORAD_CAT_ID: noradId,
    ELEMENT_SET_NO: Number(raw.ELEMENT_SET_NO ?? 999),
    REV_AT_EPOCH: Number(raw.REV_AT_EPOCH ?? 1),
    BSTAR: bstar,
    MEAN_MOTION_DOT: meanMotionDot,
    MEAN_MOTION_DDOT: meanMotionDdot,
  };

  const epochTimestampMs = parseOmmEpochMs(omm.EPOCH);
  const epochIso = new Date(epochTimestampMs).toISOString();
  const periodMinutes = meanMotion > 0 ? 1440 / meanMotion : 95;
  const orbitRegime = classifyOrbitRegime(meanMotion, eccentricity);

  return {
    noradId,
    name,
    objectId: omm.OBJECT_ID,
    category,
    epochIso,
    epochTimestampMs,
    omm,
    sourceProvider: provider,
    fetchedAtMs,
    inclinationDeg: inclination,
    eccentricity,
    meanMotionRevPerDay: meanMotion,
    periodMinutes,
    orbitRegime,
  };
}

/**
 * Convierte un par de líneas TLE (con nombre) en `SatelliteOrbitalData`.
 */
export function normalizeTleRecord(
  name: string,
  line1: string,
  line2: string,
  category: ConstellationCategory,
  provider: DataProviderId,
  fetchedAtMs: number = Date.now()
): SatelliteOrbitalData | null {
  const cleanL1 = line1.trim();
  const cleanL2 = line2.trim();
  if (!cleanL1.startsWith('1 ') || !cleanL2.startsWith('2 ')) {
    return null;
  }

  const noradId = parseInt(cleanL2.substring(2, 7).trim(), 10);
  const objectId = cleanL1.substring(9, 17).trim();
  const inclinationDeg = parseFloat(cleanL2.substring(8, 16).trim()) || 0;
  const eccentricity = parseFloat(`0.${cleanL2.substring(26, 33).trim()}`) || 0;
  const meanMotionRevPerDay = parseFloat(cleanL2.substring(52, 63).trim()) || 15;
  const periodMinutes = meanMotionRevPerDay > 0 ? 1440 / meanMotionRevPerDay : 95;
  const { epochIso, epochTimestampMs } = parseTleEpochMs(cleanL1);
  const orbitRegime = classifyOrbitRegime(meanMotionRevPerDay, eccentricity);

  return {
    noradId,
    name: name.trim() || `NORAD ${noradId}`,
    objectId,
    category,
    epochIso,
    epochTimestampMs,
    tle: {
      line1: cleanL1,
      line2: cleanL2,
    },
    sourceProvider: provider,
    fetchedAtMs,
    inclinationDeg,
    eccentricity,
    meanMotionRevPerDay,
    periodMinutes,
    orbitRegime,
  };
}

/**
 * Parsea un bloque de texto 3LE (Nombre + Línea 1 + Línea 2) de CelesTrak o Space-Track.
 */
export function parseThreeLineElementText(
  tleText: string,
  category: ConstellationCategory,
  provider: DataProviderId
): SatelliteOrbitalData[] {
  const lines = tleText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const results: SatelliteOrbitalData[] = [];
  const fetchedAtMs = Date.now();

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('1 ') && i + 1 < lines.length && lines[i + 1].startsWith('2 ')) {
      const name = i > 0 && !lines[i - 1].startsWith('2 ') ? lines[i - 1] : `SAT`;
      const record = normalizeTleRecord(name, lines[i], lines[i + 1], category, provider, fetchedAtMs);
      if (record) results.push(record);
      i += 1;
    }
  }

  return results;
}

