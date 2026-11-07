/**
 * Script de verificación y validación científica en vivo (Sección 6 - Informe de Validación).
 * Consulta CelesTrak GP JSON y Where the ISS at?, ejecuta SGP4 (satellite.js v7.1)
 * y genera métricas reales de error superficial (Haversine) y 3D (ECEF) en km.
 */
import * as satellite from 'satellite.js';

const EARTH_RADIUS_KM = 6378.137;

function haversineKm(lat1Deg, lon1Deg, lat2Deg, lon2Deg) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2Deg - lat1Deg);
  const dLon = toRad(lon2Deg - lon1Deg);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1Deg)) * Math.cos(toRad(lat2Deg)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function ecefDistanceKm(p1, p2) {
  const e1 = satellite.geodeticToEcf({
    latitude: satellite.degreesToRadians(p1.lat),
    longitude: satellite.degreesToRadians(p1.lon),
    height: p1.alt,
  });
  const e2 = satellite.geodeticToEcf({
    latitude: satellite.degreesToRadians(p2.lat),
    longitude: satellite.degreesToRadians(p2.lon),
    height: p2.alt,
  });
  return Math.hypot(e1.x - e2.x, e1.y - e2.y, e1.z - e2.z);
}

async function main() {
  console.log('=== VALIDACION EXPERIMENTAL SGP4 vs WHERE THE ISS AT? / CELESTRAK ===');

  const wtiaTleRes = await fetch('https://api.wheretheiss.at/v1/satellites/25544/tles');
  const wtiaTle = await wtiaTleRes.json();

  const wtiaPosRes = await fetch('https://api.wheretheiss.at/v1/satellites/25544?units=kilometers');
  const wtiaPos = await wtiaPosRes.json();

  const evalDate = new Date(wtiaPos.timestamp * 1000);
  const satrecTle = satellite.twoline2satrec(wtiaTle.line1, wtiaTle.line2);
  const pv = satellite.propagate(satrecTle, evalDate);
  const gmst = satellite.gstime(evalDate);
  const geo = satellite.eciToGeodetic(pv.position, gmst);

  const localPos = {
    lat: satellite.degreesLat(geo.latitude),
    lon: satellite.degreesLong(geo.longitude),
    alt: geo.height,
    vel: Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z),
  };

  const extPos = {
    lat: Number(wtiaPos.latitude),
    lon: Number(wtiaPos.longitude),
    alt: Number(wtiaPos.altitude),
    vel: Number(wtiaPos.velocity) / 3600,
  };

  const surfErrKm = haversineKm(localPos.lat, localPos.lon, extPos.lat, extPos.lon);
  const err3DKm = ecefDistanceKm(localPos, extPos);
  const altErrKm = Math.abs(localPos.alt - extPos.alt);
  const ageHours = (wtiaPos.timestamp - wtiaTle.tle_timestamp) / 3600;

  console.log(
    JSON.stringify(
      {
        timestampIso: evalDate.toISOString(),
        tleAgeHours: Number(ageHours.toFixed(2)),
        localPos,
        extPos,
        metrics: {
          surfaceDistanceErrorKm: Number(surfErrKm.toFixed(4)),
          altitudeErrorKm: Number(altErrKm.toFixed(4)),
          spatial3DErrorKm: Number(err3DKm.toFixed(4)),
        },
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('Error en validación online:', err.message);
});

