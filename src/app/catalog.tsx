import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSatelliteTracker } from '../context/SatelliteTrackerContext';
import { PRESET_LOCATIONS } from '../services/observerService';
import type { ConstellationCategory, SatelliteOrbitalData } from '../types/orbital';

const CATEGORIES: Array<{ id: ConstellationCategory; label: string; subtitle: string }> = [
  { id: 'stations', label: '🛰️ Estaciones / ISS', subtitle: 'LEO Tripuladas y Ciencia' },
  { id: 'starlink', label: '✨ Starlink (SupGP)', subtitle: 'Efemérides Suplementarias SpaceX' },
  { id: 'gps-ops', label: '🧭 GPS Navstar', subtitle: 'Órbita Media (MEO ~20.200 km)' },
  { id: 'weather', label: '🌦️ Meteorológicos', subtitle: 'NOAA / METEOR Heliosincrónicos' },
  { id: 'geo', label: '📡 GEO / ARSAT', subtitle: 'Órbita Geoestacionaria (~35.786 km)' },
];

export default function CatalogScreen() {
  const {
    activeCategory,
    setActiveCategory,
    catalog,
    isLoadingCatalog,
    catalogSource,
    catalogFromCache,
    selectedSatellite,
    selectSatellite,
    fetchSatelliteByNoradId,
    refreshCurrentCatalog,
    observer,
    setObserver,
    useGpsLocation,
  } = useSatelliteTracker();

  const [searchQuery, setSearchQuery] = useState('');
  const [directNoradInput, setDirectNoradInput] = useState('');
  const [isSearchingNorad, setIsSearchingNorad] = useState(false);

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (sat) =>
        sat.name.toLowerCase().includes(q) ||
        String(sat.noradId).includes(q) ||
        sat.objectId.toLowerCase().includes(q)
    );
  }, [catalog, searchQuery]);

  const handleSelectSatellite = (sat: SatelliteOrbitalData) => {
    selectSatellite(sat);
    router.push('/');
  };

  const handleDirectNoradLookup = async () => {
    const num = parseInt(directNoradInput.trim(), 10);
    if (Number.isNaN(num) || num <= 0) {
      Alert.alert('NORAD ID inválido', 'Ingrese un número de catálogo NORAD válido (ej. 25544).');
      return;
    }
    setIsSearchingNorad(true);
    try {
      const sat = await fetchSatelliteByNoradId(num);
      setDirectNoradInput('');
      Alert.alert(
        'Satélite cargado',
        `${sat.name} (#${sat.noradId}) obtenido desde ${sat.sourceProvider.toUpperCase()}.`,
        [{ text: 'Ver en Mapa', onPress: () => router.push('/') }]
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('No encontrado', msg);
    } finally {
      setIsSearchingNorad(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Selector de Estación Terrena / Observador */}
      <View style={styles.observerBox}>
        <View style={styles.observerHeader}>
          <Text style={styles.sectionTitle}>📍 Estación Terrena (Observador):</Text>
          <TouchableOpacity style={styles.gpsButton} onPress={useGpsLocation}>
            <Text style={styles.gpsButtonText}>🎯 Usar mi GPS</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.observerCurrent}>
          {observer.label} ({observer.latitudeDeg.toFixed(4)}°, {observer.longitudeDeg.toFixed(4)}° •{' '}
          {observer.altitudeMeters.toFixed(0)} msnm)
        </Text>
        <View style={styles.presetRow}>
          {PRESET_LOCATIONS.map((loc) => {
            const active =
              Math.abs(loc.latitudeDeg - observer.latitudeDeg) < 0.01 &&
              Math.abs(loc.longitudeDeg - observer.longitudeDeg) < 0.01;
            return (
              <TouchableOpacity
                key={loc.label}
                style={[styles.presetChip, active && styles.presetChipActive]}
                onPress={() => setObserver(loc)}
              >
                <Text style={[styles.presetChipText, active && styles.presetChipTextActive]}>
                  {loc.label.split(' (')[0]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Filtro de Constelaciones (RF-08) */}
      <View style={styles.categoriesWrapper}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={CATEGORIES}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.categoriesList}
          renderItem={({ item }) => {
            const isSelected = item.id === activeCategory;
            return (
              <TouchableOpacity
                style={[styles.categoryCard, isSelected && styles.categoryCardActive]}
                onPress={() => setActiveCategory(item.id)}
              >
                <Text style={[styles.categoryTitle, isSelected && styles.categoryTitleActive]}>
                  {item.label}
                </Text>
                <Text style={styles.categorySubtitle}>{item.subtitle}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Buscador local + Consulta directa por NORAD ID (RF-01) */}
      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="Filtrar por nombre o NORAD ID (ej. ISS, STARLINK, ARSAT, 25544)..."
          placeholderTextColor="#64748B"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        <View style={styles.directLookupRow}>
          <TextInput
            style={styles.noradInput}
            placeholder="Consulta directa NORAD ID (ej. 25544 o 100001)"
            placeholderTextColor="#64748B"
            keyboardType="numeric"
            value={directNoradInput}
            onChangeText={setDirectNoradInput}
          />
          <TouchableOpacity
            style={styles.lookupButton}
            onPress={handleDirectNoradLookup}
            disabled={isSearchingNorad}
          >
            {isSearchingNorad ? (
              <ActivityIndicator size="small" color="#0F172A" />
            ) : (
              <Text style={styles.lookupButtonText}>Buscar API</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={() => refreshCurrentCatalog(true)}
            disabled={isLoadingCatalog}
          >
            <Text style={styles.refreshBtnText}>🔄</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sourceMetaRow}>
          <Text style={styles.sourceMetaText}>
            Proveedor activo: <Text style={styles.highlight}>{catalogSource.toUpperCase()}</Text>{' '}
            {catalogFromCache ? '(Caché local TTL vigente)' : '(Descarga directa)'} •{' '}
            {filteredCatalog.length} objetos
          </Text>
        </View>
      </View>

      {/* Lista de satélites del catálogo */}
      {isLoadingCatalog ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>
            Obteniendo datos orbitales OMM/TLE y verificando caché...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredCatalog}
          keyExtractor={(item) => `${item.noradId}-${item.name}`}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isSelected = item.noradId === selectedSatellite.noradId;
            const ageHours = Math.max(
              0,
              (Date.now() - item.epochTimestampMs) / (1000 * 3600)
            );
            const formatBadge = item.omm ? 'OMM/JSON' : 'TLE';
            const isSixDigit = item.noradId >= 100000;

            return (
              <TouchableOpacity
                style={[styles.satRow, isSelected && styles.satRowSelected]}
                onPress={() => handleSelectSatellite(item)}
              >
                <View style={styles.satMain}>
                  <View style={styles.satHeaderRow}>
                    <Text style={styles.satName}>{item.name}</Text>
                    <View
                      style={[
                        styles.regimeBadge,
                        item.orbitRegime === 'LEO'
                          ? styles.badgeLeo
                          : item.orbitRegime === 'GEO'
                            ? styles.badgeGeo
                            : styles.badgeMeo,
                      ]}
                    >
                      <Text style={styles.regimeBadgeText}>{item.orbitRegime}</Text>
                    </View>
                    <View
                      style={[
                        styles.formatBadge,
                        isSixDigit && styles.formatBadgeSixDigit,
                      ]}
                    >
                      <Text style={styles.formatBadgeText}>
                        {isSixDigit ? 'OMM 6-DÍGITOS' : formatBadge}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.satDetails}>
                    NORAD #{item.noradId} ({item.objectId || 'N/A'}) • Inc:{' '}
                    {item.inclinationDeg.toFixed(2)}° • Período: {item.periodMinutes.toFixed(1)} min
                  </Text>
                  <Text style={styles.satEpoch}>
                    Época GP: {item.epochIso.substring(0, 19).replace('T', ' ')} UTC (hace{' '}
                    {ageHours.toFixed(1)} h)
                  </Text>
                </View>

                <View style={styles.selectAction}>
                  <Text style={[styles.selectText, isSelected && styles.selectTextActive]}>
                    {isSelected ? 'ACTIVO' : 'Seguir →'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070D19',
  },
  observerBox: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  observerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  gpsButton: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  gpsButtonText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  observerCurrent: {
    color: '#E2E8F0',
    fontSize: 11,
    marginTop: 4,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  presetChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#1E293B',
  },
  presetChipActive: {
    backgroundColor: '#38BDF8',
  },
  presetChipText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600',
  },
  presetChipTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  categoriesWrapper: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  categoriesList: {
    paddingHorizontal: 12,
    gap: 8,
  },
  categoryCard: {
    backgroundColor: '#111C33',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  categoryCardActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.16)',
    borderColor: '#38BDF8',
  },
  categoryTitle: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
  },
  categoryTitleActive: {
    color: '#38BDF8',
  },
  categorySubtitle: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 2,
  },
  searchSection: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: '#0B1325',
  },
  searchInput: {
    backgroundColor: '#111C33',
    color: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    fontSize: 12,
  },
  directLookupRow: {
    flexDirection: 'row',
    gap: 8,
  },
  noradInput: {
    flex: 1,
    backgroundColor: '#111C33',
    color: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    fontSize: 12,
  },
  lookupButton: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  lookupButtonText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
  },
  refreshBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  refreshBtnText: {
    fontSize: 14,
  },
  sourceMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sourceMetaText: {
    color: '#94A3B8',
    fontSize: 11,
  },
  highlight: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  listContent: {
    padding: 12,
    gap: 8,
  },
  satRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111C33',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  satRowSelected: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  satMain: {
    flex: 1,
    gap: 3,
  },
  satHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  satName: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  regimeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeLeo: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  badgeMeo: {
    backgroundColor: 'rgba(250, 204, 21, 0.2)',
  },
  badgeGeo: {
    backgroundColor: 'rgba(168, 85, 247, 0.25)',
  },
  regimeBadgeText: {
    color: '#F8FAFC',
    fontSize: 9,
    fontWeight: '700',
  },
  formatBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#1E293B',
  },
  formatBadgeSixDigit: {
    backgroundColor: 'rgba(245, 158, 11, 0.28)',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  formatBadgeText: {
    color: '#38BDF8',
    fontSize: 9,
    fontWeight: '700',
  },
  satDetails: {
    color: '#CBD5E1',
    fontSize: 11,
  },
  satEpoch: {
    color: '#64748B',
    fontSize: 10,
  },
  selectAction: {
    marginLeft: 10,
  },
  selectText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  selectTextActive: {
    color: '#38BDF8',
  },
});

