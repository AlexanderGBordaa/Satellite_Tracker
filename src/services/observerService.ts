import * as Location from 'expo-location';
import { Accelerometer, Magnetometer } from 'expo-sensors';
import type { ObserverLocation } from '../types/orbital';

export const PRESET_LOCATIONS: ObserverLocation[] = [
  {
    label: 'Concepción del Uruguay (FCyT UADER)',
    latitudeDeg: -32.4845,
    longitudeDeg: -58.2321,
    altitudeMeters: 24,
    isGpsActive: false,
  },
  {
    label: 'Córdoba (Centro Espacial CONAE Falda del Carmen)',
    latitudeDeg: -31.5241,
    longitudeDeg: -64.4635,
    altitudeMeters: 560,
    isGpsActive: false,
  },
  {
    label: 'Buenos Aires (CABA)',
    latitudeDeg: -34.6037,
    longitudeDeg: -58.3816,
    altitudeMeters: 25,
    isGpsActive: false,
  },
  {
    label: 'Bariloche (Sede INVAP)',
    latitudeDeg: -41.1258,
    longitudeDeg: -71.2525,
    altitudeMeters: 800,
    isGpsActive: false,
  },
];

export interface DeviceOrientation {
  headingAzimuthDeg: number; // 0° a 360° (rumbo magnético hacia donde apunta la parte superior/trasera del teléfono)
  pitchElevationDeg: number; // -90° a +90° (inclinación vertical al apuntar hacia el cielo)
  isSensorAvailable: boolean;
}

/**
 * Obtiene la ubicación GPS actual del dispositivo móvil o recurre a Concepción del Uruguay por defecto.
 */
export async function requestDeviceGpsLocation(): Promise<ObserverLocation> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return PRESET_LOCATIONS[0];
    }

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitudeDeg: pos.coords.latitude,
      longitudeDeg: pos.coords.longitude,
      altitudeMeters: pos.coords.altitude ?? 25,
      label: 'Ubicación GPS Actual',
      isGpsActive: true,
    };
  } catch {
    return PRESET_LOCATIONS[0];
  }
}

/**
 * Suscribe a los sensores de orientación del dispositivo (Magnetómetro + Acelerómetro)
 * para el Modo Brújula / Apuntado Asistido (RF-07).
 */
export function subscribeToDeviceOrientation(
  onUpdate: (orientation: DeviceOrientation) => void
): () => void {
  let magSub: { remove: () => void } | null = null;
  let accSub: { remove: () => void } | null = null;
  let headingSub: Location.LocationSubscription | null = null;
  let isActive = true;

  let currentHeading = 0;
  let currentPitch = 30;
  let hasSensor = false;

  const emit = () => {
    if (!isActive) return;
    onUpdate({
      headingAzimuthDeg: (currentHeading + 360) % 360,
      pitchElevationDeg: Math.max(-90, Math.min(90, currentPitch)),
      isSensorAvailable: hasSensor,
    });
  };

  (async () => {
    try {
      // 1. Intentar Location.watchHeadingAsync (combina magnetómetro + giroscopio calibrado del SO)
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status === 'granted') {
        headingSub = await Location.watchHeadingAsync((headingData) => {
          hasSensor = true;
          const h =
            headingData.trueHeading >= 0 ? headingData.trueHeading : headingData.magHeading;
          // Filtro paso bajo exponencial para suavizar saltos de brújula
          const diff = ((h - currentHeading + 540) % 360) - 180;
          currentHeading = (currentHeading + 0.25 * diff + 360) % 360;
          emit();
        });
      }
    } catch {
      // Fallback a Magnetometer directo si watchHeadingAsync no está disponible
    }

    try {
      const magAvailable = await Magnetometer.isAvailableAsync();
      if (magAvailable && !headingSub) {
        Magnetometer.setUpdateInterval(120);
        magSub = Magnetometer.addListener((data) => {
          hasSensor = true;
          let angle = Math.atan2(data.y, data.x) * (180 / Math.PI);
          angle = (90 - angle + 360) % 360;
          const diff = ((angle - currentHeading + 540) % 360) - 180;
          currentHeading = (currentHeading + 0.2 * diff + 360) % 360;
          emit();
        });
      }
    } catch {
      // Ignorar en simuladores sin magnetómetro
    }

    try {
      const accAvailable = await Accelerometer.isAvailableAsync();
      if (accAvailable) {
        Accelerometer.setUpdateInterval(120);
        accSub = Accelerometer.addListener((acc) => {
          hasSensor = true;
          // Cuando el usuario sostiene el teléfono verticalmente apuntando al horizonte,
          // y ~ -1g -> elevación ~0°; cuando lo inclina hacia el cenit (cielo), z -> -1g -> elevación ~90°
          const norm = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z) || 1;
          const pitchDeg = Math.asin(Math.max(-1, Math.min(1, -acc.z / norm))) * (180 / Math.PI);
          currentPitch = currentPitch * 0.75 + pitchDeg * 0.25;
          emit();
        });
      }
    } catch {
      // Ignorar en simuladores sin acelerómetro
    }
  })();

  return () => {
    isActive = false;
    magSub?.remove();
    accSub?.remove();
    headingSub?.remove();
  };
}

