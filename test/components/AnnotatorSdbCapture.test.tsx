import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, act, fireEvent, cleanup } from '@testing-library/react';
import {
  loadAnnotatorSdbSettings,
  saveAnnotatorSdbSettings,
} from '../../utils/annotatorSdbSettings';
import { useAnnotatorSdbCapture } from '../../components/ScreenshotAnnotator/hooks/useAnnotatorSdbCapture';
import AnnotatorSdbPopover from '../../components/ScreenshotAnnotator/components/AnnotatorSdbPopover';

describe('Snap Studio SDB Device Capture', () => {
  const originalElectronAPI = window.electronAPI;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    window.electronAPI = originalElectronAPI;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('persists and shares SDB path and last device ID with Log Extractor keys', () => {
    localStorage.setItem('tizen_sdb_path', 'C:\\tizen-studio\\tools\\sdb.exe');
    localStorage.setItem('lastSdbDeviceId', '192.168.250.250:26101');

    const loaded = loadAnnotatorSdbSettings();
    expect(loaded.sdbPath).toBe('C:\\tizen-studio\\tools\\sdb.exe');
    expect(loaded.deviceId).toBe('192.168.250.250:26101');
    expect(loaded.existingBehavior).toBe('ask');
    expect(loaded.delaySec).toBe(0);

    saveAnnotatorSdbSettings({
      ...loaded,
      autoConnectIp: '192.168.250.250',
      existingBehavior: 'replace',
      delaySec: 3,
      customCommand: 'enlightenment_info -dump_screen',
    });

    const reloaded = loadAnnotatorSdbSettings();
    expect(reloaded.autoConnectIp).toBe('192.168.250.250');
    expect(reloaded.existingBehavior).toBe('replace');
    expect(reloaded.delaySec).toBe(3);
    expect(reloaded.customCommand).toBe('enlightenment_info -dump_screen');
  });

  it('captures binary subarray cleanly and passes forceReplace based on settings', async () => {
    // Simulate a packed binary frame where image bytes start at non-zero byteOffset (12)
    const packed = new Uint8Array([0, 0, 0, 8, 123, 125, 0, 0, 0, 0, 0, 0, 0x89, 0x50, 0x4e, 0x47]);
    const imageSubarray = packed.subarray(12);

    const captureMock = vi.fn().mockResolvedValue({
      deviceId: '192.168.250.250:26101',
      mime: 'image/png',
      bytes: imageSubarray,
    });
    const listMock = vi.fn().mockResolvedValue([{ id: '192.168.250.250:26101', type: 'device' }]);
    window.electronAPI = {
      ...(originalElectronAPI as any),
      captureSdbScreen: captureMock,
      listSdbDevices: listMock,
    };

    const onCaptured = vi.fn().mockResolvedValue(undefined);
    const addToast = vi.fn();

    const { result } = renderHook(() =>
      useAnnotatorSdbCapture({ onCaptured, addToast })
    );

    act(() => {
      result.current.updateSettings({ existingBehavior: 'replace', autoConnectIp: '192.168.250.250' });
    });

    await act(async () => {
      result.current.triggerCapture();
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 30));
    });

    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(captureMock).toHaveBeenCalledWith({
      deviceId: '',
      sdbPath: '',
      customCommand: '',
      autoConnectIp: '192.168.250.250',
    });
    expect(onCaptured).toHaveBeenCalledTimes(1);
    const [dataUrl, title, forceReplace] = onCaptured.mock.calls[0];
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    // Base64 of [0x89, 0x50, 0x4e, 0x47] is "iVBORw==" (proves subarray offset was respected)
    expect(dataUrl).toBe('data:image/png;base64,iVBORw==');
    expect(title).toContain('SDB 192.168.250.250:26101');
    expect(forceReplace).toBe(true);
  });

  it('supports 3s delayed capture countdown, cancellation, and error recovery callback', async () => {
    vi.useFakeTimers();

    const captureMock = vi.fn().mockRejectedValue(new Error('No connected SDB device found'));
    window.electronAPI = {
      ...(originalElectronAPI as any),
      captureSdbScreen: captureMock,
    };

    const onCaptured = vi.fn().mockResolvedValue(undefined);
    const addToast = vi.fn();
    const onCaptureError = vi.fn();

    const { result } = renderHook(() =>
      useAnnotatorSdbCapture({ onCaptured, addToast, onCaptureError })
    );

    act(() => {
      result.current.updateSettings({ delaySec: 3 });
    });

    // Start 3s countdown and cancel midway
    act(() => {
      result.current.triggerCapture();
    });
    expect(result.current.countdownSec).toBe(3);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.countdownSec).toBe(2);

    act(() => {
      result.current.triggerCapture(); // cancels countdown
    });
    expect(result.current.countdownSec).toBeNull();
    expect(captureMock).not.toHaveBeenCalled();

    // Start countdown again and let it finish -> triggers error handler
    act(() => {
      result.current.triggerCapture();
    });
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(result.current.lastError).toBe('No connected SDB device found');
    expect(onCaptureError).toHaveBeenCalledTimes(1);
    expect(addToast).toHaveBeenCalledWith('No connected SDB device found', 'error');
  });

  it('AnnotatorSdbPopover scans devices on open and triggers capture cleanly', () => {
    const onRefreshDevices = vi.fn();
    const onUpdateSettings = vi.fn();
    const onCaptureNow = vi.fn();
    const onClose = vi.fn();

    const { getByText } = render(
      <AnnotatorSdbPopover
        isOpen={true}
        settings={loadAnnotatorSdbSettings()}
        devices={[{ id: '192.168.250.250:26101', type: 'device' }]}
        isScanning={false}
        isCapturing={false}
        countdownSec={null}
        lastError={null}
        onUpdateSettings={onUpdateSettings}
        onRefreshDevices={onRefreshDevices}
        onCaptureNow={onCaptureNow}
        onClose={onClose}
      />
    );

    expect(onRefreshDevices).toHaveBeenCalledTimes(1);
    expect(getByText('192.168.250.250:26101 (device)')).toBeTruthy();

    fireEvent.click(getByText('3s Delay'));
    expect(onUpdateSettings).toHaveBeenCalledWith({ delaySec: 3 });

    fireEvent.click(getByText('Capture Now (Ctrl+Shift+D)'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCaptureNow).toHaveBeenCalledTimes(1);
  });
});
