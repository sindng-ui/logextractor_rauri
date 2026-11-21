import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AnnotatorSdbSettings,
  loadAnnotatorSdbSettings,
  saveAnnotatorSdbSettings,
} from '../../../utils/annotatorSdbSettings';
import { blobToDataUrl } from '../../../utils/annotatorImageOps';

export interface SdbDeviceInfo {
  id: string;
  type: string;
}

interface UseAnnotatorSdbCaptureParams {
  onCaptured: (dataUrl: string, title: string, forceReplace: boolean) => Promise<void>;
  addToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  onCaptureError?: () => void;
}

const formatCaptureTime = (): string => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
};

export function useAnnotatorSdbCapture({
  onCaptured,
  addToast,
  onCaptureError,
}: UseAnnotatorSdbCaptureParams) {
  const [settings, setSettings] = useState<AnnotatorSdbSettings>(loadAnnotatorSdbSettings);
  const [devices, setDevices] = useState<SdbDeviceInfo[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [countdownSec, setCountdownSec] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const isCapturingRef = useRef(false);
  const countdownTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const clearCountdown = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (mountedRef.current) {
      setCountdownSec(null);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (countdownTimerRef.current !== null) {
        window.clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<AnnotatorSdbSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      settingsRef.current = next;
      saveAnnotatorSdbSettings(next);
      return next;
    });
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!window.electronAPI?.listSdbDevices) return;
    setIsScanning(true);
    try {
      const list = await window.electronAPI.listSdbDevices(settingsRef.current.sdbPath);
      if (mountedRef.current) {
        setDevices(list);
      }
    } catch {
      if (mountedRef.current) {
        setDevices([]);
      }
    } finally {
      if (mountedRef.current) {
        setIsScanning(false);
      }
    }
  }, []);

  const executeCaptureNow = useCallback(async () => {
    if (isCapturingRef.current) return;
    if (!window.electronAPI?.captureSdbScreen) {
      addToast('SDB capture requires the Tauri desktop app.', 'warning');
      return;
    }

    isCapturingRef.current = true;
    setIsCapturing(true);
    setLastError(null);

    const cur = settingsRef.current;
    try {
      const res = await window.electronAPI.captureSdbScreen({
        deviceId: cur.deviceId,
        sdbPath: cur.sdbPath,
        customCommand: cur.customCommand,
        autoConnectIp: cur.autoConnectIp,
      });

      // Use a slice copy so Blob respects exact Uint8Array subarray byteOffset/byteLength
      const safeBytes = res.bytes.slice();
      const blob = new Blob([safeBytes.buffer], { type: res.mime || 'image/png' });
      const dataUrl = await blobToDataUrl(blob);
      const title = `SDB ${res.deviceId} · ${formatCaptureTime()}`;

      if (!mountedRef.current) return;
      await onCaptured(dataUrl, title, cur.existingBehavior === 'replace');
    } catch (err: any) {
      const rawMsg =
        typeof err === 'string'
          ? err
          : err?.message || 'Failed to capture screen from SDB device.';
      if (mountedRef.current) {
        setLastError(rawMsg);
        addToast(rawMsg, 'error');
        onCaptureError?.();
      }
    } finally {
      isCapturingRef.current = false;
      if (mountedRef.current) {
        setIsCapturing(false);
      }
    }
  }, [onCaptured, addToast, onCaptureError]);

  const triggerCapture = useCallback(() => {
    if (isCapturingRef.current) return;

    // Clicking while counting down cancels the pending delayed capture
    if (countdownTimerRef.current !== null) {
      clearCountdown();
      addToast('Cancelled delayed SDB capture', 'info');
      return;
    }

    const delay = settingsRef.current.delaySec;
    if (delay <= 0) {
      void executeCaptureNow();
      return;
    }

    let remaining: number = delay;
    setCountdownSec(remaining);
    countdownTimerRef.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearCountdown();
        void executeCaptureNow();
      } else if (mountedRef.current) {
        setCountdownSec(remaining);
      }
    }, 1000);
  }, [clearCountdown, executeCaptureNow, addToast]);

  return {
    settings,
    devices,
    isScanning,
    isCapturing,
    countdownSec,
    lastError,
    updateSettings,
    refreshDevices,
    triggerCapture,
    cancelCountdown: clearCountdown,
  };
}
