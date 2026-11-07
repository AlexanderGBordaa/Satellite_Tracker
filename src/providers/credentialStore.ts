import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY_N2YO_API_KEY = 'sat_tracker_n2yo_api_key';
const KEY_SPACETRACK_IDENTITY = 'sat_tracker_spacetrack_identity';
const KEY_SPACETRACK_PASSWORD = 'sat_tracker_spacetrack_password';

export interface ProviderCredentials {
  n2yoApiKey: string;
  spaceTrackIdentity: string;
  spaceTrackPassword: string;
}

async function getSecret(key: string): Promise<string> {
  try {
    if (Platform.OS === 'web') {
      return (await AsyncStorage.getItem(key)) ?? '';
    }
    return (await SecureStore.getItemAsync(key)) ?? '';
  } catch {
    return (await AsyncStorage.getItem(key)) ?? '';
  }
}

async function setSecret(key: string, value: string): Promise<void> {
  const trimmed = value.trim();
  try {
    if (Platform.OS === 'web') {
      if (trimmed) {
        await AsyncStorage.setItem(key, trimmed);
      } else {
        await AsyncStorage.removeItem(key);
      }
      return;
    }
    if (trimmed) {
      await SecureStore.setItemAsync(key, trimmed);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  } catch {
    if (trimmed) {
      await AsyncStorage.setItem(key, trimmed);
    } else {
      await AsyncStorage.removeItem(key);
    }
  }
}

/**
 * Almacenamiento seguro de credenciales de Space-Track y API Key de N2YO
 * en el Keychain/Keystore nativo del dispositivo (Sección 4.3).
 */
export const credentialStore = {
  async getCredentials(): Promise<ProviderCredentials> {
    const [n2yoApiKey, spaceTrackIdentity, spaceTrackPassword] = await Promise.all([
      getSecret(KEY_N2YO_API_KEY),
      getSecret(KEY_SPACETRACK_IDENTITY),
      getSecret(KEY_SPACETRACK_PASSWORD),
    ]);
    return {
      n2yoApiKey: n2yoApiKey || process.env.EXPO_PUBLIC_N2YO_API_KEY || '',
      spaceTrackIdentity: spaceTrackIdentity || process.env.EXPO_PUBLIC_SPACETRACK_USER || '',
      spaceTrackPassword: spaceTrackPassword || process.env.EXPO_PUBLIC_SPACETRACK_PASS || '',
    };
  },

  async saveCredentials(creds: Partial<ProviderCredentials>): Promise<void> {
    if (creds.n2yoApiKey !== undefined) {
      await setSecret(KEY_N2YO_API_KEY, creds.n2yoApiKey);
    }
    if (creds.spaceTrackIdentity !== undefined) {
      await setSecret(KEY_SPACETRACK_IDENTITY, creds.spaceTrackIdentity);
    }
    if (creds.spaceTrackPassword !== undefined) {
      await setSecret(KEY_SPACETRACK_PASSWORD, creds.spaceTrackPassword);
    }
  },
};

