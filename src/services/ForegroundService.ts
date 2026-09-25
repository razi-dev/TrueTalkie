// src/services/ForegroundService.ts
// Android foreground service using expo-notifications
// Keeps audio alive when phone is locked

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const CHANNEL_ID = "truetalkie_service";
const NOTIFICATION_ID = "truetalkie-active-99";

// Configure how notifications appear
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowList: false,
  }),
});

export async function startForegroundService(channelCode: string): Promise<void> {
  if (Platform.OS !== "android") return;

  // Create Android notification channel
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "True Talkie Active",
    importance: Notifications.AndroidImportance.LOW,
    sound: null,
    vibrationPattern: null,
    enableVibrate: false,
  });

  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: {
      title: "True Talkie Active",
      body: `Listening on ${channelCode}`,
      data: { channelCode },
      sticky: true,
      autoDismiss: false,
    },
    trigger: null, // Show immediately
  });

  console.log("[ForegroundService] Started for", channelCode);
}

export async function updateForegroundService(
  channelCode: string,
  isTransmitting: boolean
): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: {
      title: isTransmitting ? "Transmitting..." : "True Talkie Active",
      body: isTransmitting
        ? `Broadcasting on ${channelCode}`
        : `Listening on ${channelCode}`,
      data: { channelCode },
      sticky: true,
      autoDismiss: false,
    },
    trigger: null,
  });
}

export async function stopForegroundService(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
  console.log("[ForegroundService] Stopped");
}
