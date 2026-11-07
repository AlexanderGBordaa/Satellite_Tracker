import * as BackgroundFetch from 'expo-background-fetch';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { predictUpcomingPasses } from '../prediction/passPredictor';
import { dataOrchestrator } from '../providers/dataProviderOrchestrator';
import type { PassWindow } from '../types/orbital';
import { PRESET_LOCATIONS } from './observerService';

export const BACKGROUND_ORBITAL_SYNC_TASK = 'SATELLITE_TRACKER_BACKGROUND_SYNC';

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {
  // En entorno web o sin módulo nativo cargado
}

// Definición de la tarea en segundo plano para refrescar efemérides y recalcular pases (Sección 4.6)
try {
  if (!TaskManager.isTaskDefined(BACKGROUND_ORBITAL_SYNC_TASK)) {
    TaskManager.defineTask(BACKGROUND_ORBITAL_SYNC_TASK, async () => {
      try {
        const result = await dataOrchestrator.getCatalog('stations', false);
        const iss = result.satellites.find((s) => s.noradId === 25544) ?? result.satellites[0];
        if (iss) {
          const passes = predictUpcomingPasses(iss, PRESET_LOCATIONS[0], {
            hoursAhead: 12,
            minMaxElevationDeg: 15,
            maxPasses: 2,
          });
          if (passes.length > 0) {
            await schedulePassReminder(passes[0], 5);
          }
        }
        return BackgroundFetch.BackgroundFetchResult.NewData;
      } catch {
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });
  }
} catch {
  // Ignorar si TaskManager no está disponible en web
}

export async function registerBackgroundOrbitalSync(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_ORBITAL_SYNC_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_ORBITAL_SYNC_TASK, {
        minimumInterval: 60 * 60 * 4, // Cada 4 horas verifica TTL y próximos pases
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
    return true;
  } catch {
    return false;
  }
}

export async function ensureNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

/**
 * Programa un recordatorio local `minutesBefore` minutos antes del AOS de un pase visible (RF-06).
 * Si el pase comienza en menos de `minutesBefore` minutos, dispara el recordatorio en 3 segundos.
 */
export async function schedulePassReminder(
  pass: PassWindow,
  minutesBefore: number = 10
): Promise<{ notificationId: string; scheduledForMs: number }> {
  const granted = await ensureNotificationPermissions();
  if (!granted) {
    throw new Error('Permisos de notificaciones no concedidos en el dispositivo.');
  }

  const targetTimeMs = pass.aosTimeMs - minutesBefore * 60 * 1000;
  const nowMs = Date.now();
  const delaySeconds = Math.max(3, Math.round((targetTimeMs - nowMs) / 1000));

  const aosDateStr = new Date(pass.aosTimeMs).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: `🛰️ Pase próximo: ${pass.satelliteName}`,
      body: `AOS a las ${aosDateStr} (Az ${pass.aosAzimuthDeg.toFixed(
        0
      )}°) • Elevación máx: ${pass.maxElevationDeg.toFixed(1)}° • Duración: ${Math.round(
        pass.durationSeconds / 60
      )} min`,
      data: {
        noradId: pass.noradId,
        passId: pass.id,
      },
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: delaySeconds,
      repeats: false,
    },
  });

  return {
    notificationId,
    scheduledForMs: nowMs + delaySeconds * 1000,
  };
}

/**
 * Dispara una notificación de prueba en 2 segundos para verificar el funcionamiento
 * durante la demostración en video requerida en la Sección 6 del TP.
 */
export async function triggerDemoPassNotification(pass: PassWindow): Promise<string> {
  const granted = await ensureNotificationPermissions();
  if (!granted) {
    throw new Error('Active los permisos de notificaciones del sistema para recibir la alerta.');
  }

  const aosTime = new Date(pass.aosTimeMs).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return Notifications.scheduleNotificationAsync({
    content: {
      title: `🛰️ [Alerta de Pase] ${pass.satelliteName} (NORAD ${pass.noradId})`,
      body: `Visible desde las ${aosTime} • Elev. Máx ${pass.maxElevationDeg.toFixed(
        1
      )}° (Azimut AOS ${pass.aosAzimuthDeg.toFixed(0)}° → LOS ${pass.losAzimuthDeg.toFixed(0)}°)`,
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
      repeats: false,
    },
  });
}

