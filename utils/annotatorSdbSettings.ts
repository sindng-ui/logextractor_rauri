export type SdbExistingBehavior = 'ask' | 'replace';

export interface AnnotatorSdbSettings {
  deviceId: string;
  autoConnectIp: string;
  sdbPath: string;
  existingBehavior: SdbExistingBehavior;
  delaySec: 0 | 3;
  customCommand: string;
}

// Shared keys with TizenConnectionModal (Log Extractor) so SDB configuration stays 100% synced
const SHARED_SDB_PATH_KEY = 'tizen_sdb_path';
const SHARED_LAST_DEVICE_KEY = 'lastSdbDeviceId';

// Snap Studio-specific SDB capture preferences
const SNAP_SDB_IP_KEY = 'snap_studio_sdb_ip';
const SNAP_SDB_BEHAVIOR_KEY = 'snap_studio_sdb_behavior';
const SNAP_SDB_DELAY_KEY = 'snap_studio_sdb_delay_sec';
const SNAP_SDB_CUSTOM_CMD_KEY = 'snap_studio_sdb_custom_cmd';

export function loadAnnotatorSdbSettings(): AnnotatorSdbSettings {
  try {
    const deviceId = localStorage.getItem(SHARED_LAST_DEVICE_KEY) || '';
    const sdbPath = localStorage.getItem(SHARED_SDB_PATH_KEY) || '';
    const autoConnectIp = localStorage.getItem(SNAP_SDB_IP_KEY) || '';
    const rawBehavior = localStorage.getItem(SNAP_SDB_BEHAVIOR_KEY);
    const existingBehavior: SdbExistingBehavior =
      rawBehavior === 'replace' ? 'replace' : 'ask';
    const rawDelay = Number(localStorage.getItem(SNAP_SDB_DELAY_KEY));
    const delaySec: 0 | 3 = rawDelay === 3 ? 3 : 0;
    const customCommand = localStorage.getItem(SNAP_SDB_CUSTOM_CMD_KEY) || '';

    return {
      deviceId,
      autoConnectIp,
      sdbPath,
      existingBehavior,
      delaySec,
      customCommand,
    };
  } catch {
    return {
      deviceId: '',
      autoConnectIp: '',
      sdbPath: '',
      existingBehavior: 'ask',
      delaySec: 0,
      customCommand: '',
    };
  }
}

export function saveAnnotatorSdbSettings(settings: AnnotatorSdbSettings): void {
  try {
    localStorage.setItem(SHARED_LAST_DEVICE_KEY, settings.deviceId);
    localStorage.setItem(SHARED_SDB_PATH_KEY, settings.sdbPath);
    localStorage.setItem(SNAP_SDB_IP_KEY, settings.autoConnectIp);
    localStorage.setItem(SNAP_SDB_BEHAVIOR_KEY, settings.existingBehavior);
    localStorage.setItem(SNAP_SDB_DELAY_KEY, String(settings.delaySec));
    localStorage.setItem(SNAP_SDB_CUSTOM_CMD_KEY, settings.customCommand);
  } catch {
    // ignore storage quota / private mode errors
  }
}
