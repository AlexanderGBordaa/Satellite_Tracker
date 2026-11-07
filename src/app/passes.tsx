import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { PolarSkyChart } from '../components/PolarSkyChart';
import { useSatelliteTracker } from '../context/SatelliteTrackerContext';
import {
  schedulePassReminder,
  triggerDemoPassNotification,
} from '../services/notificationService';

const LEAD_TIME_OPTIONS = [5, 10, 15, 30];

export default function PassesScreen() {
  const {
    selectedSatellite,
    telemetry,
    observer,
    minElevationDeg,
    setMinElevationDeg,
    upcomingPasses,
    selectedPass,
    setSelectedPass,
    isPredictingPasses,
    recalculatePasses,
    notificationLeadMinutes,
    setNotificationLeadMinutes,
  } = useSatelliteTracker();

  const [notificationStatus, setNotificationStatus] = useState<string | null>(null);

  const handleScheduleReminder = async () => {
    if (!selectedPass) return;
    try {
      const res = await schedulePassReminder(selectedPass, notificationLeadMinutes);
      const timeStr = new Date(res.scheduledForMs).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const msg = `Recordatorio programado (${notificationLeadMinutes} min antes del AOS, para las ${timeStr}).`;
      setNotificationStatus(msg);
      Alert.alert('Recordatorio de Pase Activo', msg);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Aviso de Notificaciones', msg);
    }
  };

  const handleTriggerDemoNotification = async () => {
    const passToUse =
      selectedPass ??
      ({
        id: 'demo-pass',
        noradId: selectedSatellite.noradId,
        satelliteName: selectedSatellite.name,
        aosTimeMs: Date.now() + 10 * 60 * 1000,
        aosAzimuthDeg: 215,
        tcaTimeMs: Date.now() + 15 * 60 * 1000,
        maxElevationDeg: 64.5,
        tcaAzimuthDeg: 310,
        minRangeKm: 485,
        losTimeMs: Date.now() + 20 * 60 * 1000,
        losAzimuthDeg: 42,
        durationSeconds: 600,
        skyTrack: [],
      } as const);

    try {
      await triggerDemoPassNotification(passToUse);
      setNotificationStatus(
        `Notificación de prueba disparada (se mostrará en 2 segundos para ${passToUse.satelliteName}).`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Aviso de Notificaciones', msg);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Cabecera del satélite y estación terrena */}
      <View style={styles.headerCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.satTitle}>
            {selectedSatellite.name} (#{selectedSatellite.noradId})
          </Text>
          <Text style={styles.observerSub}>
            Observador: {observer.label} ({observer.latitudeDeg.toFixed(3)}°,{' '}
            {observer.longitudeDeg.toFixed(3)}°)
          </Text>
        </View>
        <TouchableOpacity style={styles.recalcBtn} onPress={recalculatePasses}>
          <Text style={styles.recalcBtnText}>🔄 Recalcular</Text>
        </TouchableOpacity>
      </View>

      {/* Sky Chart Polar SVG (RF-05) */}
      <View style={styles.skyChartCard}>
        <Text style={styles.sectionTitle}>
          Gráfico Polar de Bóveda Celeste (Sky Chart SVG)
        </Text>
        <Text style={styles.sectionSubtitle}>
          Anillos concéntricos: 0° (horizonte), 30°, 60° y 90° (cenit) • Umbral operativo:{' '}
          {minElevationDeg}°
        </Text>

        <View style={styles.chartWrapper}>
          <PolarSkyChart
            size={285}
            pass={selectedPass}
            liveLookAngles={telemetry?.lookAngles}
            minElevationDeg={minElevationDeg}
          />
        </View>

        {/* Leyenda del Sky Chart */}
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#22C55E' }]} />
            <Text style={styles.legendText}>AOS (Inicio)</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#FACC15' }]} />
            <Text style={styles.legendText}>TCA (Elev. Máx)</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
            <Text style={styles.legendText}>LOS (Fin)</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#00F5D4' }]} />
            <Text style={styles.legendText}>Posición Vivo</Text>
          </View>
        </View>
      </View>

      {/* Configuración de Recordatorios de Pase y Botón Demo (RF-06) */}
      <View style={styles.notifCard}>
        <Text style={styles.sectionTitle}>🔔 Recordatorios de Pase (RF-06)</Text>
        <View style={styles.leadRow}>
          <Text style={styles.leadLabel}>Anticipación (N min):</Text>
          {LEAD_TIME_OPTIONS.map((min) => (
            <TouchableOpacity
              key={`lead-${min}`}
              style={[
                styles.leadChip,
                notificationLeadMinutes === min && styles.leadChipActive,
              ]}
              onPress={() => setNotificationLeadMinutes(min)}
            >
              <Text
                style={[
                  styles.leadChipText,
                  notificationLeadMinutes === min && styles.leadChipTextActive,
                ]}
              >
                {min} min
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.notifButtonsRow}>
          <TouchableOpacity
            style={[styles.primaryBtn, !selectedPass && styles.btnDisabled]}
            onPress={handleScheduleReminder}
            disabled={!selectedPass}
          >
            <Text style={styles.primaryBtnText}>
              ⏰ Programar ({notificationLeadMinutes}m antes)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.demoBtn}
            onPress={handleTriggerDemoNotification}
          >
            <Text style={styles.demoBtnText}>🚀 Disparar Alerta Demo (2s)</Text>
          </TouchableOpacity>
        </View>

        {notificationStatus && (
          <Text style={styles.notifFeedback}>{notificationStatus}</Text>
        )}
      </View>

      {/* Selector de umbral de elevación mínima para el predictor */}
      <View style={styles.filterHeader}>
        <Text style={styles.sectionTitle}>
          Próximas Ventanas de Visibilidad (24 h • Búsqueda Grueso → Fino)
        </Text>
        <View style={styles.elThresholdRow}>
          <Text style={styles.leadLabel}>Umbral elevación máx:</Text>
          {[0, 10, 25, 45].map((deg) => (
            <TouchableOpacity
              key={`pass-el-${deg}`}
              style={[
                styles.leadChip,
                minElevationDeg === deg && styles.leadChipActive,
              ]}
              onPress={() => setMinElevationDeg(deg)}
            >
              <Text
                style={[
                  styles.leadChipText,
                  minElevationDeg === deg && styles.leadChipTextActive,
                ]}
              >
                ≥ {deg}°
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Listado de pases calculados (RF-04) */}
      {isPredictingPasses ? (
        <View style={styles.loadingPasses}>
          <ActivityIndicator size="small" color="#38BDF8" />
          <Text style={styles.loadingText}>
            Ejecutando refinamiento por bisección y sección áurea...
          </Text>
        </View>
      ) : upcomingPasses.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            No se encontraron pases con elevación máxima ≥ {minElevationDeg}° en las próximas 24
            horas desde {observer.label}. Pruebe reducir el umbral a 0° o 10°.
          </Text>
        </View>
      ) : (
        upcomingPasses.map((pass, index) => {
          const isCurrent = selectedPass?.id === pass.id;
          const dateLabel = new Date(pass.aosTimeMs).toLocaleDateString([], {
            day: '2-digit',
            month: '2-digit',
          });
          const aosTime = new Date(pass.aosTimeMs).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
          const tcaTime = new Date(pass.tcaTimeMs).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
          const losTime = new Date(pass.losTimeMs).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });

          return (
            <TouchableOpacity
              key={pass.id}
              style={[styles.passCard, isCurrent && styles.passCardActive]}
              onPress={() => setSelectedPass(pass)}
            >
              <View style={styles.passCardHeader}>
                <Text style={styles.passIndexText}>
                  Pase #{index + 1} • {dateLabel}
                </Text>
                <View style={styles.maxElBadge}>
                  <Text style={styles.maxElBadgeText}>
                    Elev. Máx: {pass.maxElevationDeg.toFixed(1)}°
                  </Text>
                </View>
              </View>

              <View style={styles.passTimelineRow}>
                <View style={styles.passPhaseCol}>
                  <Text style={styles.phaseTitleGreen}>AOS (Inicio)</Text>
                  <Text style={styles.phaseTime}>{aosTime}</Text>
                  <Text style={styles.phaseAz}>Az: {pass.aosAzimuthDeg.toFixed(1)}°</Text>
                </View>

                <View style={styles.passPhaseCol}>
                  <Text style={styles.phaseTitleYellow}>TCA (Punto Máx)</Text>
                  <Text style={styles.phaseTime}>{tcaTime}</Text>
                  <Text style={styles.phaseAz}>
                    Az: {pass.tcaAzimuthDeg.toFixed(1)}° • {pass.minRangeKm.toFixed(0)} km
                  </Text>
                </View>

                <View style={styles.passPhaseCol}>
                  <Text style={styles.phaseTitleRed}>LOS (Fin)</Text>
                  <Text style={styles.phaseTime}>{losTime}</Text>
                  <Text style={styles.phaseAz}>Az: {pass.losAzimuthDeg.toFixed(1)}°</Text>
                </View>
              </View>

              <Text style={styles.passDurationFooter}>
                Duración de ventana: {Math.floor(pass.durationSeconds / 60)}m{' '}
                {pass.durationSeconds % 60}s • Toque para graficar en el Sky Chart
              </Text>
            </TouchableOpacity>
          );
        })
      )}
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  satTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  observerSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  recalcBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  recalcBtnText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  skyChartCard: {
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center',
  },
  sectionTitle: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '700',
    alignSelf: 'flex-start',
  },
  sectionSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    alignSelf: 'flex-start',
    marginTop: 2,
    marginBottom: 8,
  },
  chartWrapper: {
    marginVertical: 6,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  legendText: {
    color: '#CBD5E1',
    fontSize: 11,
  },
  notifCard: {
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 10,
  },
  leadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  leadLabel: {
    color: '#94A3B8',
    fontSize: 11,
    marginRight: 4,
  },
  leadChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#1E293B',
  },
  leadChipActive: {
    backgroundColor: '#38BDF8',
  },
  leadChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  leadChipTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  notifButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#38BDF8',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.45,
  },
  primaryBtnText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
  },
  demoBtn: {
    flex: 1,
    backgroundColor: '#22C55E',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  demoBtnText: {
    color: '#052E16',
    fontSize: 12,
    fontWeight: '700',
  },
  notifFeedback: {
    color: '#4ADE80',
    fontSize: 11,
  },
  filterHeader: {
    gap: 6,
  },
  elThresholdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  loadingPasses: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  emptyCard: {
    backgroundColor: '#111C33',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  passCard: {
    backgroundColor: '#111C33',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 8,
  },
  passCardActive: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  passCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  passIndexText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  maxElBadge: {
    backgroundColor: 'rgba(250, 204, 21, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FACC15',
  },
  maxElBadgeText: {
    color: '#FDE047',
    fontSize: 11,
    fontWeight: '700',
  },
  passTimelineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0B1325',
    padding: 8,
    borderRadius: 8,
  },
  passPhaseCol: {
    flex: 1,
  },
  phaseTitleGreen: {
    color: '#4ADE80',
    fontSize: 10,
    fontWeight: '700',
  },
  phaseTitleYellow: {
    color: '#FACC15',
    fontSize: 10,
    fontWeight: '700',
  },
  phaseTitleRed: {
    color: '#F87171',
    fontSize: 10,
    fontWeight: '700',
  },
  phaseTime: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  phaseAz: {
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 1,
  },
  passDurationFooter: {
    color: '#64748B',
    fontSize: 10,
  },
});

