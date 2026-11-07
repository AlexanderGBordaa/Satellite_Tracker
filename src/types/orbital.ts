/**
 * Tipos de dominio para mecánica orbital, proveedores de datos y predicción de visibilidad.
 * Soporta tanto formato OMM/JSON (recomendado por CelesTrak para catálogos de 6 dígitos)
 * como formato clásico TLE (Two-Line Element Set).
 */

export type ConstellationCategory =
  | 'stations'
  | 'starlink'
  | 'gps-ops'
  | 'weather'
  | 'geo';

export type OrbitRegime = 'LEO' | 'MEO' | 'GEO' | 'HEO';

export type DataProviderId =
  | 'celestrak'
  | 'spacetrack'
  | 'n2yo'
  | 'wheretheiss'
  | 'offline-seed';

import type { OMMJsonObject } from 'satellite.js';

/**
 * Representación estándar CCSDS OMM (Orbit Mean-Elements Message) en JSON
 * distribuida por CelesTrak GP API y Space-Track.
 * Soporta NORAD_CAT_ID de hasta 9 dígitos (superando el límite de 5 dígitos del TLE clásico).
 */
export interface OMMRecord extends OMMJsonObject {
  OBJECT_NAME: string;
  OBJECT_ID: string;
  EPOCH: string; // ISO-8601 UTC (sin 'Z' en CelesTrak)
  MEAN_MOTION: number; // rev/día
  ECCENTRICITY: number;
  INCLINATION: number; // grados
  RA_OF_ASC_NODE: number; // grados
  ARG_OF_PERICENTER: number; // grados
  MEAN_ANOMALY: number; // grados
  EPHEMERIS_TYPE?: 0 | '0';
  CLASSIFICATION_TYPE?: 'U' | 'C';
  NORAD_CAT_ID: number;
  ELEMENT_SET_NO: number;
  REV_AT_EPOCH: number;
  BSTAR: number; // 1 / radio terrestre
  MEAN_MOTION_DOT: number;
  MEAN_MOTION_DDOT: number;
}

/**
 * Modelo unificado de un satélite y sus elementos orbitales medios (GP).
 */
export interface SatelliteOrbitalData {
  noradId: number;
  name: string;
  objectId: string;
  category: ConstellationCategory;
  epochIso: string;
  epochTimestampMs: number;
  /** Formato OMM JSON (preferido para soporte de 6 dígitos y parsing directo con json2satrec) */
  omm?: OMMRecord;
  /** Formato TLE clásico de dos líneas (usado por N2YO, WhereTheISS y Space-Track TLE) */
  tle?: {
    line1: string;
    line2: string;
  };
  /** Metadatos de origen y caché */
  sourceProvider: DataProviderId;
  fetchedAtMs: number;
  inclinationDeg: number;
  eccentricity: number;
  meanMotionRevPerDay: number;
  periodMinutes: number;
  orbitRegime: OrbitRegime;
}

/**
 * Posición geodésica subsatelital (WGS-84) e inercial ECI en un instante t.
 */
export interface SubsatellitePoint {
  noradId: number;
  timestampMs: number;
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeKm: number;
  velocityKmPerSec: number;
  eciPositionKm: { x: number; y: number; z: number };
  eciVelocityKmPerSec: { x: number; y: number; z: number };
}

/**
 * Coordenadas topocéntricas respecto del observador terrestre.
 */
export interface TopocentricLookAngles {
  azimuthDeg: number; // 0° = Norte, 90° = Este, 180° = Sur, 270° = Oeste
  elevationDeg: number; // -90° a +90° (positivo sobre el horizonte)
  rangeSatKm: number; // Slant range en km
  rangeRateKmPerSec: number; // Velocidad radial para estimación Doppler
  dopplerShiftHzAt10GHz: number; // Desplazamiento Doppler ilustrativo en banda Ku/X (10 GHz)
  isVisibleAboveHorizon: boolean;
  isAboveMinElevation: boolean;
}

/**
 * Estado completo calculado en tiempo real para el satélite seleccionado.
 */
export interface SatelliteTelemetry {
  orbital: SatelliteOrbitalData;
  subsatellite: SubsatellitePoint;
  lookAngles: TopocentricLookAngles;
  footprintRadiusKm: number;
  orbitalDataAgeHours: number;
  isDataStale: boolean;
}

/**
 * Punto individual del ground track sobre el mapa.
 */
export interface GroundTrackPoint {
  latitude: number;
  longitude: number;
  timestampMs: number;
  isPast: boolean;
}

/**
 * Segmento continuo de polilínea (cortado en el cruce del antimeridiano ±180°).
 */
export interface GroundTrackSegment {
  id: string;
  isPast: boolean;
  coordinates: Array<{ latitude: number; longitude: number }>;
}

/**
 * Punto en coordenadas polares y cartesianas normalizadas para el Sky Chart SVG.
 */
export interface SkyTrackPoint {
  timestampMs: number;
  azimuthDeg: number;
  elevationDeg: number;
  rangeKm: number;
}

/**
 * Ventana de visibilidad predicha (AOS -> TCA/Max -> LOS).
 */
export interface PassWindow {
  id: string;
  noradId: number;
  satelliteName: string;
  aosTimeMs: number;
  aosAzimuthDeg: number;
  tcaTimeMs: number; // Time of Closest Approach / Max Elevation
  maxElevationDeg: number;
  tcaAzimuthDeg: number;
   minRangeKm: number;
  losTimeMs: number;
  losAzimuthDeg: number;
  durationSeconds: number;
  skyTrack: SkyTrackPoint[];
}

/**
 * Posición geográfica del observador terrestre.
 */
export interface ObserverLocation {
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeMeters: number;
  label: string;
  isGpsActive: boolean;
}

/**
 * Muestra obtenida de un proveedor externo para validación cruzada (RF-15).
 */
export interface ExternalValidationSample {
  provider: DataProviderId;
  noradId: number;
  satelliteName: string;
  timestampMs: number;
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeKm: number;
  velocityKmPerSec?: number;
  azimuthDeg?: number;
  elevationDeg?: number;
}

/**
 * Resultado de comparación científica entre el motor SGP4 local y una fuente independiente.
 */
export interface ValidationComparisonResult {
  id: string;
  timestampMs: number;
  noradId: number;
  satelliteName: string;
  externalProvider: DataProviderId;
  orbitalDataSource: DataProviderId;
  orbitalDataAgeHours: number;
  localPosition: {
    latitudeDeg: number;
    longitudeDeg: number;
    altitudeKm: number;
    azimuthDeg: number;
    elevationDeg: number;
  };
  externalPosition: {
    latitudeDeg: number;
    longitudeDeg: number;
    altitudeKm: number;
    azimuthDeg?: number;
    elevationDeg?: number;
  };
  metrics: {
    surfaceDistanceErrorKm: number; // Distancia geodésica Haversine sobre la superficie
    altitudeErrorKm: number; // |Alt_local - Alt_ext|
    spatial3DErrorKm: number; // Distancia euclídea 3D en ECEF (km)
    latitudeDiffDeg: number;
    longitudeDiffDeg: number;
    azimuthDiffDeg?: number;
    elevationDiffDeg?: number;
  };
}

/**
 * Estado del limitador de tasa (Rate Limiter) por proveedor.
 */
export interface RateLimiterStatus {
  providerId: DataProviderId;
  requestsInLastMinute: number;
  maxPerMinute: number;
  requestsInLastHour: number;
  maxPerHour: number;
  backoffUntilMs: number;
  totalRequests: number;
  totalThrottled: number;
}

/**
 * Interfaz común requerida por la sección 4.3 de la consigna.
 */
export interface DataProvider {
  readonly id: DataProviderId;
  readonly displayName: string;
  readonly defaultTtlHours: number;
  isConfigured(): Promise<boolean>;
  getCatalog(category: ConstellationCategory): Promise<SatelliteOrbitalData[]>;
  getOrbitalData(noradId: number): Promise<SatelliteOrbitalData>;
  getValidationPosition?(
    noradId: number,
    observer: ObserverLocation
  ): Promise<ExternalValidationSample>;
}
