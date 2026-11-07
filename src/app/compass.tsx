import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { useSatelliteTracker } from '../context/SatelliteTrackerContext';
import {
  subscribeToDeviceOrientation,
  type DeviceOrientation,
} from '../services/observerService';

export default function CompassScreen() {
  const { selectedSatellite, telemetry, observer } = useSatelliteTracker();

  const [orientation, setOrientation] = useState<DeviceOrientation>({
    headingAzimuthDeg: 0,
    pitchElevationDeg: 25,
    isSensorAvailable: false,
  });

  const [manualOverride, setManualOverride] = useState<boolean>(false);

  useEffect(() => {
    if (manualOverride) return;
    const unsubscribe = subscribeToDeviceOrientation((next) => {
      setOrientation(next);
    });
    return unsubscribe;
  }, [manualOverride]);

  const targetAz = telemetry?.lookAngles.azimuthDeg ?? 0;
  const targetEl = telemetry?.lookAngles.elevationDeg ?? 0;

  // Diferencia angular firmada en [-180°, +180°]
  const deltaAz = ((targetAz - orientation.headingAzimuthDeg + 540) % 360) - 180;
  const deltaEl = targetEl - orientation.pitchElevationDeg;

  const isAzAligned = Math.abs(deltaAz) <= 6;
  const isElAligned = Math.abs(deltaEl) <= 6;
  const isLocked = isAzAligned && isElAligned;

  const size = 280;
  const center = size / 2;
  const radius = size / 2 - 26;

  // Ángulo relativo del satélite respecto a la cabecera del teléfono (0° = arriba en pantalla)
  const relAngleRad = (deltaAz * Math.PI) / 180;
  const satMarkerX = center + radius * Math.sin(relAngleRad);
  const satMarkerY = center - radius * Math.cos(relAngleRad);

  // Desplazamiento del punto de mira 2D (Azimut horizontal, Elevación vertical)
  const reticleOffsetX = Math.max(-radius * 0.75, Math.min(radius * 0.75, deltaAz * 1.4));
  const reticleOffsetY = Math.max(-radius * 0.75, Math.min(radius * 0.75, -deltaEl * 1.6));

  const adjustManual = (dAz: number, dEl: number) => {
    setManualOverride(true);
    setOrientation((prev) => ({
      ...prev,
      headingAzimuthDeg: (prev.headingAzimuthDeg + dAz + 360) % 360,
      pitchElevationDeg: Math.max(-90, Math.min(90, prev.pitchElevationDeg + dEl)),
    }));
  };

  const snapToSatellite = () => {
    setManualOverride(true);
    setOrientation((prev) => ({
      ...prev,
      headingAzimuthDeg: targetAz,
      pitchElevationDeg: targetEl,
    }));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Cabecera de objetivo */}
      <View style={styles.headerCard}>
        <Text style={styles.satName}>
          🎯 Apuntado hacia: {selectedSatellite.name} (#{selectedSatellite.noradId})
        </Text>
        <Text style={styles.subText}>
          Observador: {observer.label} • Sensores:{' '}
          {manualOverride
            ? 'Modo Simulación Manual'
            : orientation.isSensorAvailable
              ? 'Magnetómetro + Acelerómetro Activos'
              : 'Sin sensor físico detectado (use controles de simulación)'}
        </Text>
      </View>

      {/* Estado de enganche de puntería */}
      <View
        style={[
          styles.guidanceBanner,
          isLocked ? styles.guidanceLocked : styles.guidanceSearching,
        ]}
      >
        <Text style={styles.guidanceTitle}>
          {isLocked
            ? '✅ SATÉLITE ALINEADO EN LA MIRA (HAZ APUNTADO)'
            : '🧭 GUÍA DE ORIENTACIÓN DEL DISPOSITIVO'}
        </Text>
        <Text style={styles.guidanceDetail}>
          {isAzAligned
            ? 'Azimut alineado ✓'
            : deltaAz > 0
              ? `Gire ${Math.abs(deltaAz).toFixed(1)}° hacia la DERECHA ↻`
              : `Gire ${Math.abs(deltaAz).toFixed(1)}° hacia la IZQUIERDA ↺`}
          {'  •  '}
          {isElAligned
            ? 'Elevación alineada ✓'
            : deltaEl > 0
              ? `Incline ${Math.abs(deltaEl).toFixed(1)}° hacia ARRIBA ↑`
              : `Incline ${Math.abs(deltaEl).toFixed(1)}° hacia ABAJO ↓`}
        </Text>
      </View>

      {/* Brújula y Retícula de Apuntado Asistido (SVG) */}
      <View style={styles.compassCard}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Círculo exterior de la rosa de los vientos */}
          <Circle
            cx={center}
            cy={center}
            r={radius}
            fill="#0A1426"
            stroke={isLocked ? '#22C55E' : '#2E4A7D'}
            strokeWidth={2.5}
          />

          {/* Círculo interior de tolerancia de haz (6°) */}
          <Circle
            cx={center}
            cy={center}
            r={24}
            fill={isLocked ? 'rgba(34, 197, 94, 0.2)' : 'none'}
            stroke={isLocked ? '#22C55E' : '#38BDF8'}
            strokeWidth={1.5}
            strokeDasharray="4,3"
          />

          {/* Ejes de la mira central */}
          <Line
            x1={center - radius}
            y1={center}
            x2={center + radius}
            y2={center}
            stroke="#1E335C"
            strokeWidth={1}
          />
          <Line
            x1={center}
            y1={center - radius}
            x2={center}
            y2={center + radius}
            stroke="#1E335C"
            strokeWidth={1}
          />

          {/* Indicador fijo de proa del teléfono (arriba) */}
          <Polygon
            points={`${center},${center - radius - 14} ${center - 7},${center - radius - 2} ${center + 7},${center - radius - 2}`}
            fill="#38BDF8"
          />

          {/* Puntos cardinales rotados según el rumbo del dispositivo */}
          {(['N', 'E', 'S', 'O'] as const).map((cardinal, idx) => {
            const cardinalDeg = idx * 90;
            const relDeg = cardinalDeg - orientation.headingAzimuthDeg;
            const rad = (relDeg * Math.PI) / 180;
            const tx = center + (radius - 16) * Math.sin(rad);
            const ty = center - (radius - 16) * Math.cos(rad) + 4;
            return (
              <SvgText
                key={cardinal}
                x={tx}
                y={ty}
                fill={cardinal === 'N' ? '#EF4444' : '#94A3B8'}
                fontSize="12"
                fontWeight="bold"
                textAnchor="middle"
              >
                {cardinal}
              </SvgText>
            );
          })}

          {/* Marcador periférico del Azimut del Satélite */}
          <G>
            <Circle
              cx={satMarkerX}
              cy={satMarkerY}
              r={8}
              fill="#FACC15"
              stroke="#0F172A"
              strokeWidth={2}
            />
          </G>

          {/* Burbuja 2D (Azimut + Elevación) que el usuario debe llevar al centro */}
          <G>
            <Line
              x1={center}
              y1={center}
              x2={center + reticleOffsetX}
              y2={center + reticleOffsetY}
              stroke="#38BDF8"
              strokeWidth={1.5}
              strokeDasharray="3,3"
            />
            <Circle
              cx={center + reticleOffsetX}
              cy={center + reticleOffsetY}
              r={12}
              fill={isLocked ? 'rgba(34, 197, 94, 0.35)' : 'rgba(56, 189, 248, 0.3)'}
              stroke={isLocked ? '#22C55E' : '#38BDF8'}
              strokeWidth={2}
            />
            <SvgText
              x={center + reticleOffsetX}
              y={center + reticleOffsetY + 4}
              fontSize="11"
              textAnchor="middle"
            >
              🛰️
            </SvgText>
          </G>
        </Svg>

        <Text style={styles.compassHint}>
          Lleve el ícono 🛰️ al círculo central para alinear Azimut y Elevación simultáneamente.
        </Text>
      </View>

      {/* Comparativa numérica Dispositivo vs Satélite */}
      <View style={styles.metricsRow}>
        <View style={styles.metricBox}>
          <Text style={styles.metricTitle}>RUMBO DISPOSITIVO</Text>
          <Text style={styles.metricValue}>{orientation.headingAzimuthDeg.toFixed(1)}°</Text>
          <Text style={styles.metricSub}>Inclinación: {orientation.pitchElevationDeg.toFixed(1)}°</Text>
        </View>

        <View style={styles.metricBox}>
          <Text style={styles.metricTitle}>POSICIÓN SATÉLITE</Text>
          <Text style={[styles.metricValue, { color: '#38BDF8' }]}>{targetAz.toFixed(1)}°</Text>
          <Text style={styles.metricSub}>Elevación: {targetEl.toFixed(1)}°</Text>
        </View>

        <View style={styles.metricBox}>
          <Text style={styles.metricTitle}>ERROR APUNTADO</Text>
          <Text
            style={[
              styles.metricValue,
              { color: isLocked ? '#4ADE80' : '#FACC15' },
            ]}
          >
            ΔAz {deltaAz >= 0 ? `+${deltaAz.toFixed(1)}` : deltaAz.toFixed(1)}°
          </Text>
          <Text style={styles.metricSub}>
            ΔEl {deltaEl >= 0 ? `+${deltaEl.toFixed(1)}` : deltaEl.toFixed(1)}°
          </Text>
        </View>
      </View>

      {/* Controles de simulación manual para pruebas en emulador o escritorio */}
      <View style={styles.simCard}>
        <View style={styles.simHeader}>
          <Text style={styles.simTitle}>🎛️ Controles de Orientación (Pruebas / Emulador)</Text>
          {manualOverride && (
            <TouchableOpacity
              style={styles.sensorRestoreBtn}
              onPress={() => setManualOverride(false)}
            >
              <Text style={styles.sensorRestoreText}>Usar Sensores Reales</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.simButtonsRow}>
          <TouchableOpacity style={styles.simBtn} onPress={() => adjustManual(-15, 0)}>
            <Text style={styles.simBtnText}>↺ Az -15°</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.simBtn} onPress={() => adjustManual(15, 0)}>
            <Text style={styles.simBtnText}>↻ Az +15°</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.simBtn} onPress={() => adjustManual(0, -10)}>
            <Text style={styles.simBtnText}>↓ El -10°</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.simBtn} onPress={() => adjustManual(0, 10)}>
            <Text style={styles.simBtnText}>↑ El +10°</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.snapButton} onPress={snapToSatellite}>
          <Text style={styles.snapButtonText}>
            🎯 Alinear Automáticamente al Satélite ({targetAz.toFixed(1)}° / {targetEl.toFixed(1)}°)
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070D19',
  },
  content: {
    padding: 12,
    gap: 12,
    paddingBottom: 28,
  },
  headerCard: {
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  satName: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  subText: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 4,
  },
  guidanceBanner: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  guidanceSearching: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: '#38BDF8',
  },
  guidanceLocked: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    borderColor: '#22C55E',
  },
  guidanceTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  guidanceDetail: {
    color: '#E2E8F0',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  compassCard: {
    backgroundColor: '#0F172A',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center',
  },
  compassHint: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 10,
    textAlign: 'center',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metricBox: {
    flex: 1,
    backgroundColor: '#111C33',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  metricTitle: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '700',
  },
  metricValue: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 3,
  },
  metricSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  simCard: {
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 10,
  },
  simHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  simTitle: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  sensorRestoreBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sensorRestoreText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '700',
  },
  simButtonsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  simBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  simBtnText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '600',
  },
  snapButton: {
    backgroundColor: '#38BDF8',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  snapButtonText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
  },
});

