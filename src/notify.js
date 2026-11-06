// Delivers the simulated access code as a real Android/iOS notification.
// No server involved: the app schedules a local notification on the device.
// Returns the notification id, or null if notifications aren't available
// (web, or permission denied) so the caller can fall back to the in-app banner.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const CHANNEL = 'access-codes';
let ready = null;

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true, // Android only shows the heads-up popup when sound is on
      shouldSetBadge: false,
    }),
  });
}

async function ensureReady() {
  if (Platform.OS === 'web') return false;
  if (ready !== null) return ready;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Access codes',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 200, 100, 200],
        lightColor: '#065CFE',
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    ready = status === 'granted';
  } catch {
    ready = false;
  }
  return ready;
}

export async function sendCodeNotification({ code, channel, to }) {
  if (!(await ensureReady())) return null;
  const sms = channel === 'phone';
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: sms ? 'BGO Safety' : 'Your BGO Safety access code',
        subtitle: sms ? undefined : 'no-reply@refineddata.com',
        body: `Your access code is ${code}. It expires in 60 seconds.`,
        data: { kind: 'access-code' },
      },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
    });
  } catch {
    return null;
  }
}

export function dismissCodeNotification(id) {
  if (!id || Platform.OS === 'web') return;
  Notifications.dismissNotificationAsync(id).catch(() => {});
}
