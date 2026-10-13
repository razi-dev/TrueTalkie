// src/services/InAppUpdateService.ts
// Handles Google Play In-App Updates using Play Core AppUpdateManager

import { Platform } from 'react-native';
import SpInAppUpdates, {
  NeedsUpdateResponse,
  IAUUpdateKind,
  StartUpdateOptions,
  IAUInstallStatus,
} from 'sp-react-native-in-app-updates';

class InAppUpdateService {
  private inAppUpdates: SpInAppUpdates | null = null;
  private hasChecked = false;

  constructor() {
    try {
      this.inAppUpdates = new SpInAppUpdates(false);
    } catch (e) {
      console.warn('[InAppUpdate] Initialization failed:', e);
    }
  }

  /**
   * Check for Google Play updates and trigger the native update flow if available.
   * @param isImmediate If true, enforces immediate full-screen update; if false, performs flexible background update.
   */
  async checkForUpdate(isImmediate: boolean = false): Promise<void> {
    if (Platform.OS !== 'android' || !this.inAppUpdates) {
      return;
    }

    try {
      console.log('[InAppUpdate] Checking for updates on Google Play...');
      const result: NeedsUpdateResponse = await this.inAppUpdates.checkNeedsUpdate();

      if (result.shouldUpdate) {
        console.log('[InAppUpdate] Update available on Google Play! Triggering native dialog...');

        const updateOptions: StartUpdateOptions = {
          updateType: isImmediate ? IAUUpdateKind.IMMEDIATE : IAUUpdateKind.FLEXIBLE,
        };

        // Listen for flexible download completion
        if (!isImmediate) {
          this.inAppUpdates.addStatusUpdateListener((downloadStatus) => {
            if (downloadStatus.status === IAUInstallStatus.DOWNLOADED) {
              console.log('[InAppUpdate] Flexible update downloaded. Prompting to restart...');
              this.inAppUpdates?.installUpdate();
            }
          });
        }

        await this.inAppUpdates.startUpdate(updateOptions);
      } else {
        console.log('[InAppUpdate] App is up to date.');
      }
    } catch (error: any) {
      // Expected when app is running outside Google Play (e.g. debug builds or sideloaded APK)
      console.log('[InAppUpdate] Notice: Update check completed (requires Play Store installation to trigger):', error?.message || error);
    }
  }
}

export const inAppUpdateService = new InAppUpdateService();
