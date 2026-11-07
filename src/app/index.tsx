import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { OrbitalWorldMap } from '../components/OrbitalWorldMap';
import { useSatelliteTracker } from '../context/SatelliteTrackerContext';

const MIN_ELEVATION_OPTIONS = [0, 10, 25, 40];
const CONSTELLATION_LIMIT_OPTIONS = [25, 48, 80];

export default function MapScreen() {
  const {
    selectedSatellite,
    telemetry,
    groundTrackSegments,
    observer,
    minElevationDeg,
    setMinElevationDeg,
    showConstellationLayer,
    setShowConstellationLayer,
    constellationLimit,
    setConstellationLimit,
    constellationPoints,
    upcomingPasses,
    refreshCurrentCatalog,
  } = useSatelliteTracker();

  const [showGroundTrack, setShowGroundTrack] = useState(true);
  const [showFootprint, setShowFootprint] = useState(true);

  const sub = telemetry?.subsatellite;
  const look = telemetry?.lookAngles;
  const nextPass = upcomingPasses[0] ?? null;

  return (
    <View style={styles.container}>
      {/* Banner de estado y antigüedad de efemérides (RF-16) */}
      <View
        style={[
          styles.topStatusBanner,
          telemetry?.isDataStale && styles.topStatusBannerStale,
        ]}
      >
        <View style={styles.statusLeft}>
          <Text style={styles.satTitle}>
            {selectedSatellite.name}{' '}
            <Text style={styles.noradBadge}>#{selectedSatellite.noradId}</Text>
          </Text>
          <Text style={styles.epochMeta}>
            Fuente: {selectedSatellite.sourceProvider.toUpperCase()} • Régimen:{' '}
            {selectedSatellite.orbitRegime} ({selectedSatellite.periodMinutes.toFixed(1)} min) •
            Antigüedad GP: {(telemetry?.orbitalDataAgeHours ?? 0).toFixed(1)} h
          </Text>
        </View>
        {telemetry?.isDataStale ? (
          <TouchableOpacity
            style={styles.staleAlertButton}
            onPress={() => refreshCurrentCatalog(true)}
          >
            <Text style={styles.staleAlertText}>⚠️ Actualizar GP</Text>
          </TouchableOpacity>
        ) : (
          <View
            style={[
              styles.visibilityPill,
              look?.isAboveMinElevation
                ? styles.visibilityPillActive
                : look?.isVisibleAboveHorizon
                  ? styles.visibilityPillHorizon
                  : styles.visibilityPillHidden,
            ]}
          >
            <Text style={styles.visibilityPillText}>
              {look?.isAboveMinElevation
                ? `EN ENLACE (> ${minElevationDeg}°)`
                : look?.isVisibleAboveHorizon
                  ? 'SOBRE HORIZONTE'
                  : 'BAJO HORIZONTE'}
            </Text>
          </View>
        )}
      </View>

      {/* Mapa Mundial con SGP4 en Tiempo Real, Ground Track, Footprint y Constelación */}
      <View style={styles.mapWrapper}>
        <OrbitalWorldMap
          telemetry={telemetry}
          groundTrackSegments={groundTrackSegments}
          observer={observer}
          showFootprint={showFootprint}
          showGroundTrack={showGroundTrack}
          showConstellationLayer={showConstellationLayer}
          constellationPoints={constellationPoints}
        />
      </View>

      {/* Panel inferior de controles de capas y telemetría SGP4 + telecomunicaciones */}
      <ScrollView style={styles.bottomPanel} contentContainerStyle={styles.bottomContent}>
        {/* Controles rápidos de capas geográficas */}
        <View style={styles.layerRow}>
          <TouchableOpacity
            style={[styles.layerChip, showGroundTrack && styles.layerChipActive]}
            onPress={() => setShowGroundTrack((v) => !v)}
          >
            <Text style={[styles.layerChipText, showGroundTrack && styles.layerChipTextActive]}>
              〰️ Ground Track ({groundTrackSegments.length} seg)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.layerChip, showFootprint && styles.layerChipActive]}
            onPress={() => setShowFootprint((v) => !v)}
          >
            <Text style={[styles.layerChipText, showFootprint && styles.layerChipTextActive]}>
              ⭕ Footprint ({telemetry ? `${telemetry.footprintRadiusKm.toFixed(0)} km` : '--'})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.layerChip,
              showConstellationLayer && styles.layerChipConstellationActive,
            ]}
            onPress={() => setShowConstellationLayer(!showConstellationLayer)}
          >
            <Text
              style={[
                styles.layerChipText,
                showConstellationLayer && styles.layerChipTextActive,
              ]}
            >
              ✨ Starlink ({showConstellationLayer ? constellationPoints.length : 'Off'})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Configuración de elevación mínima (RF-12) y límite de constelación (RF-13) */}
        <View style={styles.configRow}>
          <View style={styles.configGroup}>
            <Text style={styles.configLabel}>Elev. Mín. Enlace (ITU-R):</Text>
            <View style={styles.pillRow}>
              {MIN_ELEVATION_OPTIONS.map((deg) => (
                <TouchableOpacity
                  key={`el-${deg}`}
                  style={[
                    styles.miniPill,
                    minElevationDeg === deg && styles.miniPillActive,
                  ]}
                  onPress={() => setMinElevationDeg(deg)}
                >
                  <Text
                    style={[
                      styles.miniPillText,
                      minElevationDeg === deg && styles.miniPillTextActive,
                    ]}
                  >
                    {deg}°
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {showConstellationLayer && (
            <View style={styles.configGroup}>
              <Text style={styles.configLabel}>Límite Starlink:</Text>
              <View style={styles.pillRow}>
                {CONSTELLATION_LIMIT_OPTIONS.map((lim) => (
                  <TouchableOpacity
                    key={`lim-${lim}`}
                    style={[
                      styles.miniPill,
                      constellationLimit === lim && styles.miniPillActive,
                    ]}
                    onPress={() => setConstellationLimit(lim)}
                  >
                    <Text
                      style={[
                        styles.miniPillText,
                        constellationLimit === lim && styles.miniPillTextActive,
                      ]}
                    >
                      {lim}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Grilla de Telemetría SGP4 en Tiempo Real (RF-02 y RF-03) */}
        <View style={styles.telemetryGrid}>
          <View style={styles.telemetryCard}>
            <Text style={styles.cardLabel}>LATITUD SUBSAT</Text>
            <Text style={styles.cardValue}>
              {sub ? `${sub.latitudeDeg.toFixed(4)}°` : '--'}
            </Text>
          </View>
          <View style={styles.telemetryCard}>
            <Text style={styles.cardLabel}>LONGITUD SUBSAT</Text>
            <Text style={styles.cardValue}>
              {sub ? `${sub.longitudeDeg.toFixed(4)}°` : '--'}
            </Text>
          </View>
          <View style={styles.telemetryCard}>
            <Text style={styles.cardLabel}>ALTITUD (WGS-84)</Text>
            <Text style={styles.cardValue}>
              {sub ? `${sub.altitudeKm.toFixed(1)} km` : '--'}
            </Text>
          </View>
          <View style={styles.telemetryCard}>
            <Text style={styles.cardLabel}>VELOCIDAD ECI</Text>
            <Text style={styles.cardValue}>
              {sub ? `${sub.velocityKmPerSec.toFixed(2)} km/s` : '--'}
            </Text>
          </View>
          <View style={styles.telemetryCard}>
            <Text style={styles.cardLabel}>AZIMUT TOPOCÉNTRICO</Text>
            <Text style={[styles.cardValue, styles.accentCyan]}>
              {look ? `${look.azimuthDeg.toFixed(1)}°` : '--'}
            </Text>
          </View>
          <View style={styles.telemetryCard}>
            <Text style={styles.cardLabel}>ELEVACIÓN OBS.</Text>
            <Text
              style={[
                styles.cardValue,
                (look?.elevationDeg ?? -1) > 0 ? styles.accentGreen : styles.accentMuted,
              ]}
            >
              {look ? `${look.elevationDeg.toFixed(1)}°` : '--'}
            </Text>
          </View>
          <View style={styles.telemetryCard}>
            <Text style={styles.cardLabel}>SLANT RANGE (DIST)</Text>
            <Text style={styles.cardValue}>
              {look ? `${look.rangeSatKm.toFixed(0)} km` : '--'}
            </Text>
          </View>
          <View style={styles.telemetryCard}>
            <Text style={styles.cardLabel}>DOPPLER (10 GHz Ku)</Text>
            <Text style={styles.cardValue}>
              {look ? `${(look.dopplerShiftHzAt10GHz / 1000).toFixed(1)} kHz` : '--'}
            </Text>
          </View>
        </View>

        {/* Tarjeta resumen del próximo pase visible y acceso rápido a Sky Chart */}
        <TouchableOpacity
          style={styles.nextPassBanner}
          onPress={() => router.push('/passes')}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.nextPassTitle}>
              🔭 Próxima ventana de visibilidad ({observer.label})
            </Text>
            {nextPass ? (
              <Text style={styles.nextPassSub}>
                AOS:{' '}
                {new Date(nextPass.aosTimeMs).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                (Az {nextPass.aosAzimuthDeg.toFixed(0)}°) • Máx:{' '}
                {nextPass.maxElevationDeg.toFixed(1)}° • Duración:{' '}
                {Math.round(nextPass.durationSeconds / 60)} min
              </Text>
            ) : (
              <Text style={styles.nextPassSub}>
                Sin pases sobre {minElevationDeg}° en las próximas 24 h. Toque para ver Sky Chart.
              </Text>
            )}
          </View>
          <Text style={styles.nextPassArrow}>Sky Chart →</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070D19',
  },
  topStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  topStatusBannerStale: {
    backgroundColor: '#422006',
    borderBottomColor: '#F59E0B',
  },
  statusLeft: {
    flex: 1,
    marginRight: 8,
  },
  satTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  noradBadge: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '600',
  },
  epochMeta: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  staleAlertButton: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  staleAlertText: {
    color: '#0F172A',
    fontSize: 11,
    fontWeight: '700',
  },
  visibilityPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  visibilityPillActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    borderColor: '#22C55E',
  },
  visibilityPillHorizon: {
    backgroundColor: 'rgba(250, 204, 21, 0.2)',
    borderColor: '#FACC15',
  },
  visibilityPillHidden: {
    backgroundColor: 'rgba(100, 116, 139, 0.2)',
    borderColor: '#475569',
  },
  visibilityPillText: {
    color: '#F8FAFC',
    fontSize: 10,
    fontWeight: '700',
  },
  mapWrapper: {
    flex: 1.15,
    minHeight: 240,
  },
  bottomPanel: {
    flex: 1,
    backgroundColor: '#0B1325',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  bottomContent: {
    padding: 12,
    gap: 10,
  },
  layerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  layerChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  layerChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.18)',
    borderColor: '#38BDF8',
  },
  layerChipConstellationActive: {
    backgroundColor: 'rgba(250, 204, 21, 0.2)',
    borderColor: '#FACC15',
  },
  layerChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  layerChipTextActive: {
    color: '#F8FAFC',
  },
  configRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  configGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  configLabel: {
    color: '#94A3B8',
    fontSize: 11,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 4,
  },
  miniPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: '#1E293B',
  },
  miniPillActive: {
    backgroundColor: '#38BDF8',
  },
  miniPillText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  miniPillTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  telemetryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  telemetryCard: {
    width: '23.5%',
    flexGrow: 1,
    backgroundColor: '#111C33',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardLabel: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '700',
  },
  cardValue: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  accentCyan: {
    color: '#38BDF8',
  },
  accentGreen: {
    color: '#4ADE80',
  },
  accentMuted: {
    color: '#94A3B8',
  },
  nextPassBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111C33',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2E4A7D',
  },
  nextPassTitle: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  nextPassSub: {
    color: '#CBD5E1',
    fontSize: 11,
    marginTop: 2,
  },
  nextPassArrow: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 8,
  },
});

