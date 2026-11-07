import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSatelliteTracker } from '../context/SatelliteTrackerContext';
import { credentialStore } from '../providers/credentialStore';
import { orbitalCache } from '../providers/orbitalCache';

const TTL_OPTIONS = [12, 18, 24];

export default function ValidationScreen() {
  const {
    selectedSatellite,
    fetchSatelliteByNoradId,
    validationHistory,
    isRunningValidation,
    runValidation,
    rateLimitStatuses,
    cacheStats,
    fallbackLog,
    refreshSystemStatus,
    refreshCurrentCatalog,
  } = useSatelliteTracker();

  const [n2yoKey, setN2yoKey] = useState('');
  const [stUser, setStUser] = useState('');
  const [stPass, setStPass] = useState('');
  const [ttlHours, setTtlHours] = useState(orbitalCache.getTtlHours());
  const [credSavedMsg, setCredSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    credentialStore.getCredentials().then((creds) => {
      setN2yoKey(creds.n2yoApiKey);
      setStUser(creds.spaceTrackIdentity);
      setStPass(creds.spaceTrackPassword);
    });
    refreshSystemStatus();
  }, [refreshSystemStatus]);

  const handleValidateIssWtia = async () => {
    try {
      if (selectedSatellite.noradId !== 25544) {
        await fetchSatelliteByNoradId(25544);
      }
      await runValidation('wheretheiss');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Error en Validación ISS', msg);
    }
  };

  const handleValidateN2yo = async () => {
    try {
      await runValidation('n2yo');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Validación N2YO', msg);
    }
  };

  const handleSaveCredentials = async () => {
    await credentialStore.saveCredentials({
      n2yoApiKey: n2yoKey,
      spaceTrackIdentity: stUser,
      spaceTrackPassword: stPass,
    });
    setCredSavedMsg('Credenciales guardadas de forma segura en Keychain/Keystore.');
    setTimeout(() => setCredSavedMsg(null), 4000);
    await refreshSystemStatus();
  };

  const handleChangeTtl = async (hours: number) => {
    orbitalCache.setTtlHours(hours);
    setTtlHours(hours);
    await refreshSystemStatus();
  };

  const handleClearCache = async () => {
    await orbitalCache.clearAll();
    await refreshSystemStatus();
    Alert.alert('Caché limpiada', 'Se eliminaron los datos orbitales en caché local.');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Sección 1: Modo Validación Científica (RF-15) */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          ⚖️ Modo Validación Cruzada de Posiciones (RF-15)
        </Text>
        <Text style={styles.sectionDesc}>
          Compara en el mismo instante UTC la posición calculada localmente mediante SGP4
          (`satellite.js`) contra una fuente independiente y mide la discrepancia superficial
          (Haversine) y tridimensional (ECEF) en kilómetros.
        </Text>

        <View style={styles.targetBox}>
          <Text style={styles.targetLabel}>
            Satélite activo: <Text style={styles.boldWhite}>{selectedSatellite.name}</Text> (NORAD #
            {selectedSatellite.noradId}) • Fuente GP:{' '}
            {selectedSatellite.sourceProvider.toUpperCase()}
          </Text>
        </View>

        <View style={styles.valButtonsRow}>
          <TouchableOpacity
            style={styles.wtiaButton}
            onPress={handleValidateIssWtia}
            disabled={isRunningValidation}
          >
            {isRunningValidation ? (
              <ActivityIndicator size="small" color="#0F172A" />
            ) : (
              <Text style={styles.wtiaButtonText}>
                🛰️ Validar ISS vs Where the ISS at?
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.n2yoButton}
            onPress={handleValidateN2yo}
            disabled={isRunningValidation}
          >
            <Text style={styles.n2yoButtonText}>
              📡 Validar #{selectedSatellite.noradId} vs N2YO
            </Text>
          </TouchableOpacity>
        </View>

        {/* Resultados de validación */}
        {validationHistory.length === 0 ? (
          <View style={styles.emptyValBox}>
            <Text style={styles.emptyValText}>
              Presione &quot;Validar ISS vs Where the ISS at?&quot; (no requiere API Key) o &quot;Validar vs
              N2YO&quot; para registrar una medición experimental de error en km.
            </Text>
          </View>
        ) : (
          validationHistory.map((item) => (
            <View key={item.id} style={styles.valResultCard}>
              <View style={styles.valResultHeader}>
                <Text style={styles.valSatTitle}>
                  {item.satelliteName} (#{item.noradId}) vs{' '}
                  {item.externalProvider.toUpperCase()}
                </Text>
                <Text style={styles.valTime}>
                  {new Date(item.timestampMs).toLocaleTimeString()} UTC
                </Text>
              </View>

              <View style={styles.errorBanner}>
                <View style={styles.errorMetricCol}>
                  <Text style={styles.errorMetricLabel}>ERROR SUPERFICIAL</Text>
                  <Text style={styles.errorMetricVal}>
                    {item.metrics.surfaceDistanceErrorKm.toFixed(3)} km
                  </Text>
                </View>
                <View style={styles.errorMetricCol}>
                  <Text style={styles.errorMetricLabel}>ERROR 3D (ECEF)</Text>
                  <Text style={styles.errorMetricVal}>
                    {item.metrics.spatial3DErrorKm.toFixed(3)} km
                  </Text>
                </View>
                <View style={styles.errorMetricCol}>
                  <Text style={styles.errorMetricLabel}>Δ ALTITUD</Text>
                  <Text style={styles.errorMetricVal}>
                    {item.metrics.altitudeErrorKm.toFixed(3)} km
                  </Text>
                </View>
                <View style={styles.errorMetricCol}>
                  <Text style={styles.errorMetricLabel}>EDAD GP</Text>
                  <Text style={styles.errorMetricVal}>
                    {item.orbitalDataAgeHours.toFixed(1)} h
                  </Text>
                </View>
              </View>

              <View style={styles.compTable}>
                <View style={styles.compRow}>
                  <Text style={[styles.compCell, styles.compHeader]}>Magnitud</Text>
                  <Text style={[styles.compCell, styles.compHeader]}>SGP4 Local</Text>
                  <Text style={[styles.compCell, styles.compHeader]}>API Externa</Text>
                  <Text style={[styles.compCell, styles.compHeader]}>Diferencia</Text>
                </View>
                <View style={styles.compRow}>
                  <Text style={styles.compCell}>Latitud</Text>
                  <Text style={styles.compCell}>{item.localPosition.latitudeDeg.toFixed(4)}°</Text>
                  <Text style={styles.compCell}>
                    {item.externalPosition.latitudeDeg.toFixed(4)}°
                  </Text>
                  <Text style={styles.compCell}>
                    {item.metrics.latitudeDiffDeg.toFixed(4)}°
                  </Text>
                </View>
                <View style={styles.compRow}>
                  <Text style={styles.compCell}>Longitud</Text>
                  <Text style={styles.compCell}>{item.localPosition.longitudeDeg.toFixed(4)}°</Text>
                  <Text style={styles.compCell}>
                    {item.externalPosition.longitudeDeg.toFixed(4)}°
                  </Text>
                  <Text style={styles.compCell}>
                    {item.metrics.longitudeDiffDeg.toFixed(4)}°
                  </Text>
                </View>
                <View style={styles.compRow}>
                  <Text style={styles.compCell}>Altitud</Text>
                  <Text style={styles.compCell}>{item.localPosition.altitudeKm.toFixed(2)} km</Text>
                  <Text style={styles.compCell}>
                    {item.externalPosition.altitudeKm.toFixed(2)} km
                  </Text>
                  <Text style={styles.compCell}>
                    {item.metrics.altitudeErrorKm.toFixed(2)} km
                  </Text>
                </View>
                {item.externalPosition.azimuthDeg !== undefined && (
                  <View style={styles.compRow}>
                    <Text style={styles.compCell}>Az / El</Text>
                    <Text style={styles.compCell}>
                      {item.localPosition.azimuthDeg.toFixed(1)}° /{' '}
                      {item.localPosition.elevationDeg.toFixed(1)}°
                    </Text>
                    <Text style={styles.compCell}>
                      {item.externalPosition.azimuthDeg.toFixed(1)}° /{' '}
                      {item.externalPosition.elevationDeg?.toFixed(1)}°
                    </Text>
                    <Text style={styles.compCell}>
                      ΔAz {item.metrics.azimuthDiffDeg?.toFixed(2)}°
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ))
        )}
      </View>

      {/* Sección 2: Estado de Rate Limiters y Orquestador de Fallback (RF-09, RF-14) */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          🚦 Rate Limiter por Proveedor y Caché con TTL (RF-09, RF-14)
        </Text>

        <View style={styles.ttlRow}>
          <Text style={styles.ttlLabel}>TTL de Caché Orbital (12-24 h):</Text>
          {TTL_OPTIONS.map((h) => (
            <TouchableOpacity
              key={`ttl-${h}`}
              style={[styles.ttlChip, ttlHours === h && styles.ttlChipActive]}
              onPress={() => handleChangeTtl(h)}
            >
              <Text style={[styles.ttlChipText, ttlHours === h && styles.ttlChipTextActive]}>
                {h} h
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.cacheInfoText}>
          Categorías en caché: {cacheStats?.cachedCategories.join(', ') || 'ninguna'} • Objetos
          almacenados: {cacheStats?.totalCachedSatellites ?? 0}
        </Text>

        <View style={styles.cacheActionRow}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => refreshCurrentCatalog(true)}
          >
            <Text style={styles.secondaryBtnText}>🔄 Forzar Refresco GP</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleClearCache}>
            <Text style={styles.secondaryBtnText}>🗑️ Limpiar Caché Local</Text>
          </TouchableOpacity>
        </View>

        {/* Tabla de Rate Limiters */}
        <View style={styles.rateList}>
          {rateLimitStatuses.map((st) => (
            <View key={st.providerId} style={styles.rateItem}>
              <Text style={styles.rateProviderName}>{st.providerId.toUpperCase()}</Text>
              <Text style={styles.rateMetrics}>
                Min: {st.requestsInLastMinute}/{st.maxPerMinute} • Hora: {st.requestsInLastHour}/
                {st.maxPerHour} • Total: {st.totalRequests} (Throttled: {st.totalThrottled})
              </Text>
            </View>
          ))}
        </View>

        {/* Bitácora de Conmutación / Fallback */}
        <Text style={styles.subHeader}>Bitácora del Orquestador (Fallback Chain):</Text>
        <View style={styles.logBox}>
          {fallbackLog.map((entry, idx) => (
            <Text key={`log-${idx}`} style={styles.logLine}>
              • {entry}
            </Text>
          ))}
        </View>
      </View>

      {/* Sección 3: Almacenamiento Seguro de Credenciales (Keychain/Keystore - Sección 4.3) */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          🔐 Credenciales de APIs (Almacenamiento Seguro Keychain/Keystore)
        </Text>
        <Text style={styles.sectionDesc}>
          Las credenciales se guardan localmente mediante `expo-secure-store` fuera del código
          fuente y del bundle. CelesTrak y Where the ISS at? operan sin credenciales.
        </Text>

        <Text style={styles.inputLabel}>N2YO API Key (opcional, para validación N2YO):</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. XXXXX-XXXXX-XXXXX-XXXX"
          placeholderTextColor="#64748B"
          value={n2yoKey}
          onChangeText={setN2yoKey}
          autoCapitalize="none"
        />

        <Text style={styles.inputLabel}>Space-Track.org Usuario / Email (opcional, fallback):</Text>
        <TextInput
          style={styles.input}
          placeholder="usuario@ejemplo.com"
          placeholderTextColor="#64748B"
          value={stUser}
          onChangeText={setStUser}
          autoCapitalize="none"
        />

        <Text style={styles.inputLabel}>Space-Track.org Contraseña:</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••••••"
          placeholderTextColor="#64748B"
          secureTextEntry
          value={stPass}
          onChangeText={setStPass}
        />

        <TouchableOpacity style={styles.saveCredsBtn} onPress={handleSaveCredentials}>
          <Text style={styles.saveCredsText}>💾 Guardar en SecureStore</Text>
        </TouchableOpacity>

        {credSavedMsg && <Text style={styles.savedFeedback}>{credSavedMsg}</Text>}
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
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 10,
  },
  sectionTitle: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionDesc: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 16,
  },
  targetBox: {
    backgroundColor: '#111C33',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  targetLabel: {
    color: '#CBD5E1',
    fontSize: 11,
  },
  boldWhite: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  valButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  wtiaButton: {
    flex: 1,
    backgroundColor: '#38BDF8',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wtiaButtonText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
  },
  n2yoButton: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38BDF8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  n2yoButtonText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyValBox: {
    backgroundColor: '#111C33',
    padding: 12,
    borderRadius: 8,
  },
  emptyValText: {
    color: '#94A3B8',
    fontSize: 11,
  },
  valResultCard: {
    backgroundColor: '#111C33',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2E4A7D',
    gap: 8,
  },
  valResultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  valSatTitle: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  valTime: {
    color: '#94A3B8',
    fontSize: 10,
  },
  errorBanner: {
    flexDirection: 'row',
    backgroundColor: '#0B1325',
    padding: 8,
    borderRadius: 8,
    justifyContent: 'space-between',
  },
  errorMetricCol: {
    alignItems: 'center',
  },
  errorMetricLabel: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '700',
  },
  errorMetricVal: {
    color: '#4ADE80',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  compTable: {
    gap: 4,
  },
  compRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  compCell: {
    flex: 1,
    color: '#CBD5E1',
    fontSize: 10,
  },
  compHeader: {
    color: '#94A3B8',
    fontWeight: '700',
  },
  ttlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ttlLabel: {
    color: '#CBD5E1',
    fontSize: 11,
    marginRight: 4,
  },
  ttlChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#1E293B',
  },
  ttlChipActive: {
    backgroundColor: '#38BDF8',
  },
  ttlChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  ttlChipTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  cacheInfoText: {
    color: '#94A3B8',
    fontSize: 11,
  },
  cacheActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  secondaryBtnText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '600',
  },
  rateList: {
    gap: 6,
  },
  rateItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#111C33',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  rateProviderName: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  rateMetrics: {
    color: '#CBD5E1',
    fontSize: 10,
  },
  subHeader: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  logBox: {
    backgroundColor: '#070D19',
    padding: 8,
    borderRadius: 8,
    gap: 3,
  },
  logLine: {
    color: '#94A3B8',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  inputLabel: {
    color: '#CBD5E1',
    fontSize: 11,
    marginTop: 2,
  },
  input: {
    backgroundColor: '#111C33',
    color: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    fontSize: 12,
  },
  saveCredsBtn: {
    backgroundColor: '#22C55E',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  saveCredsText: {
    color: '#052E16',
    fontSize: 12,
    fontWeight: '700',
  },
  savedFeedback: {
    color: '#4ADE80',
    fontSize: 11,
    textAlign: 'center',
  },
});

