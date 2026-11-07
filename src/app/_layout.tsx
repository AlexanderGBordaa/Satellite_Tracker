import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SatelliteTrackerProvider } from '../context/SatelliteTrackerContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SatelliteTrackerProvider>
        <StatusBar style="light" />
        <Tabs
          screenOptions={{
            headerStyle: {
              backgroundColor: '#0B1325',
            },
            headerTintColor: '#F8FAFC',
            headerTitleStyle: {
              fontWeight: '700',
              fontSize: 16,
            },
            tabBarStyle: {
              backgroundColor: '#0B1325',
              borderTopColor: '#1E293B',
              height: 62,
              paddingBottom: 8,
              paddingTop: 6,
            },
            tabBarActiveTintColor: '#38BDF8',
            tabBarInactiveTintColor: '#64748B',
            tabBarLabelStyle: {
              fontSize: 11,
              fontWeight: '600',
            },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'Mapa Orbital',
              headerTitle: '🛰️ Satellite Tracker • SGP4 Tiempo Real',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="earth" size={size} color={String(color)} />
              ),
            }}
          />
          <Tabs.Screen
            name="catalog"
            options={{
              title: 'Catálogo',
              headerTitle: '📡 Catálogo NORAD y Constelaciones',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="planet" size={size} color={String(color)} />
              ),
            }}
          />
          <Tabs.Screen
            name="passes"
            options={{
              title: 'Sky Chart',
              headerTitle: '🔭 Predicción de Pases y Sky Chart',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="radio-outline" size={size} color={String(color)} />
              ),
            }}
          />
          <Tabs.Screen
            name="compass"
            options={{
              title: 'Brújula',
              headerTitle: '🧭 Orientación Asistida (Az/El)',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="compass" size={size} color={String(color)} />
              ),
            }}
          />
          <Tabs.Screen
            name="validation"
            options={{
              title: 'Validación',
              headerTitle: '⚖️ Validación Científica y Proveedores',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="analytics" size={size} color={String(color)} />
              ),
            }}
          />
        </Tabs>
      </SatelliteTrackerProvider>
    </SafeAreaProvider>
  );
}
