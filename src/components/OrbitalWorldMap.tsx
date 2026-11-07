import React, { useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Circle, Marker, Polyline } from 'react-native-maps';
import type {
  GroundTrackSegment,
  ObserverLocation,
  SatelliteTelemetry,
  SubsatellitePoint,
} from '../types/orbital';

export interface OrbitalWorldMapProps {
  telemetry: SatelliteTelemetry | null;
  groundTrackSegments: GroundTrackSegment[];
  observer: ObserverLocation;
  showFootprint: boolean;
  showGroundTrack: boolean;
  showConstellationLayer: boolean;
  constellationPoints: SubsatellitePoint[];
}

export const OrbitalWorldMap: React.FC<OrbitalWorldMapProps> = ({
  telemetry,
  groundTrackSegments,
  observer,
  showFootprint,
  showGroundTrack,
  showConstellationLayer,
  constellationPoints,
}) => {
  const mapRef = useRef<MapView | null>(null);

  const centerOnSatellite = () => {
    if (!telemetry || !mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: telemetry.subsatellite.latitudeDeg,
        longitude: telemetry.subsatellite.longitudeDeg,
        latitudeDelta: 65,
        longitudeDelta: 65,
      },
      600
    );
  };

  const centerOnObserver = () => {
    if (!mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: observer.latitudeDeg,
        longitude: observer.longitudeDeg,
        latitudeDelta: 35,
        longitudeDelta: 35,
      },
      600
    );
  };

  // react-native-maps Circle utiliza radio en metros; limitamos el máximo visual para órbitas GEO
  const footprintRadiusMeters = telemetry
    ? Math.min(telemetry.footprintRadiusKm * 1000, 6200000)
    : 0;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: telemetry?.subsatellite.latitudeDeg ?? observer.latitudeDeg,
          longitude: telemetry?.subsatellite.longitudeDeg ?? observer.longitudeDeg,
          latitudeDelta: 85,
          longitudeDelta: 85,
        }}
        mapType="hybrid"
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {/* Ground Track dividido en el cruce del antimeridiano ±180° (RF-11) */}
        {showGroundTrack &&
          groundTrackSegments.map((seg) => (
            <Polyline
              key={seg.id}
              coordinates={seg.coordinates}
              strokeColor={seg.isPast ? 'rgba(250, 204, 21, 0.7)' : '#38BDF8'}
              strokeWidth={seg.isPast ? 2 : 3}
              lineDashPattern={seg.isPast ? [6, 6] : undefined}
              geodesic={false}
            />
          ))}

        {/* Footprint: área de cobertura según altitud y elevación mínima (RF-12) */}
        {showFootprint && telemetry && footprintRadiusMeters > 1000 && (
          <Circle
            center={{
              latitude: telemetry.subsatellite.latitudeDeg,
              longitude: telemetry.subsatellite.longitudeDeg,
            }}
            radius={footprintRadiusMeters}
            strokeColor="rgba(56, 189, 248, 0.9)"
            strokeWidth={2}
            fillColor="rgba(56, 189, 248, 0.16)"
          />
        )}

        {/* Capa de constelación Starlink optimizada con tracksViewChanges={false} (RF-13) */}
        {showConstellationLayer &&
          constellationPoints.map((pt) => (
            <Marker
              key={`starlink-${pt.noradId}`}
              coordinate={{
                latitude: pt.latitudeDeg,
                longitude: pt.longitudeDeg,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={styles.constellationDot} />
            </Marker>
          ))}

        {/* Marcador del observador terrestre */}
        <Marker
          coordinate={{
            latitude: observer.latitudeDeg,
            longitude: observer.longitudeDeg,
          }}
          title={observer.label}
          description={`Lat ${observer.latitudeDeg.toFixed(4)}° • Lon ${observer.longitudeDeg.toFixed(4)}°`}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={styles.observerMarker}>
            <View style={styles.observerInner} />
          </View>
        </Marker>

        {/* Marcador en tiempo real del satélite seleccionado (RF-10) */}
        {telemetry && (
          <Marker
            coordinate={{
              latitude: telemetry.subsatellite.latitudeDeg,
              longitude: telemetry.subsatellite.longitudeDeg,
            }}
            title={`${telemetry.orbital.name} (#${telemetry.orbital.noradId})`}
            description={`Alt: ${telemetry.subsatellite.altitudeKm.toFixed(1)} km • Vel: ${telemetry.subsatellite.velocityKmPerSec.toFixed(2)} km/s`}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.satMarkerContainer}>
              <View style={styles.satPulse} />
              <View style={styles.satCore}>
                <Text style={styles.satIconText}>🛰️</Text>
              </View>
              <View style={styles.satLabelBox}>
                <Text style={styles.satLabelText} numberOfLines={1}>
                  {telemetry.orbital.name}
                </Text>
              </View>
            </View>
          </Marker>
        )}
      </MapView>

      {/* Botones flotantes de enfoque rápido */}
      <View style={styles.floatingControls}>
        <TouchableOpacity style={styles.fabButton} onPress={centerOnSatellite}>
          <Text style={styles.fabText}>🛰️ Satélite</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fabButton} onPress={centerOnObserver}>
          <Text style={styles.fabText}>📍 Observador</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  satMarkerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  satPulse: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(56, 189, 248, 0.3)',
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  satCore: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    borderWidth: 2,
    borderColor: '#38BDF8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  satIconText: {
    fontSize: 14,
  },
  satLabelBox: {
    marginTop: 2,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  satLabelText: {
    color: '#F8FAFC',
    fontSize: 10,
    fontWeight: '700',
  },
  observerMarker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(34, 197, 94, 0.35)',
    borderWidth: 2,
    borderColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  observerInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  constellationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FACC15',
    borderWidth: 1,
    borderColor: '#0F172A',
  },
  floatingControls: {
    position: 'absolute',
    top: 12,
    right: 12,
    gap: 8,
  },
  fabButton: {
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  fabText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
  },
});

