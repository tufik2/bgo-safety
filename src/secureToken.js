// Sign-in token in the phone's secure storage (Android Keystore / iOS Keychain).
// The browser preview has no secure storage, so it falls back to local storage there.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const KEY = 'bgo.token';
const web = Platform.OS === 'web';

export async function getToken() {
  try { return web ? await AsyncStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY); } catch { return null; }
}
export async function setToken(t) {
  if (!t) return clearToken();
  if (web) await AsyncStorage.setItem(KEY, t); else await SecureStore.setItemAsync(KEY, t);
}
export async function clearToken() {
  try { if (web) await AsyncStorage.removeItem(KEY); else await SecureStore.deleteItemAsync(KEY); } catch { /* already gone */ }
}
