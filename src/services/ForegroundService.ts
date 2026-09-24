// src/services/ForegroundService.ts
// Android foreground service via @notifee/react-native
// Keeps audio alive when phone is locked

import notifee, { AndroidImportance, AndroidColor } from '@notifee/react-native';

const CHANNEL_ID = 'truetalkie_service';
const NOTIFICATION_ID = 'truetalkie_active';

export async function startForegroundService(channelCode: string): Promise<void> {
  // Create notification channel (Android requirement)
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'True Talkie Active',
    importance: AndroidImportance.LOW, // Low = no sound, just persistent
    lights: false,
    vibration: false,
  });

  // Display the foreground service notification
  await notifee.displayNotification({
    id: NOTIFICATION_ID,
    title: '🎙️ True Talkie Active',
    body: `Listening on ${channelCode} — hold PTT to talk`,
    android: {
      channelId: CHANNEL_ID,
      asForegroundService: true,
      ongoing: true,         // Cannot be swiped away
      smallIcon: 'ic_notification',
      color: AndroidColor.YELLOW,
      pressAction: {
        id: 'default',       // Tap notification → opens app
      },
      actions: [
        {
          title: '🔇 Leave Channel',
          pressAction: { id: 'leave' },
        },
      ],
    },
  });

  console.log('[ForegroundService] Started for', channelCode);
}

export async function updateForegroundService(channelCode: string, isTransmitting: boolean): Promise<void> {
  await notifee.displayNotification({
    id: NOTIFICATION_ID,
    title: isTransmitting ? '🎙️ TRANSMITTING...' : '🔊 True Talkie Active',
    body: isTransmitting
      ? `Broadcasting on ${channelCode}`
      : `Listening on ${channelCode} — hold PTT to talk`,
    android: {
      channelId: CHANNEL_ID,
      asForegroundService: true,
      ongoing: true,
      smallIcon: 'ic_notification',
      color: isTransmitting ? AndroidColor.RED : AndroidColor.YELLOW,
      pressAction: { id: 'default' },
      actions: [
        {
          title: '🔇 Leave Channel',
          pressAction: { id: 'leave' },
        },
      ],
    },
  });
}

export async function stopForegroundService(): Promise<void> {
  await notifee.stopForegroundService();
  await notifee.cancelNotification(NOTIFICATION_ID);
  console.log('[ForegroundService] Stopped');
}
