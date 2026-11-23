import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { FileText } from 'lucide-react';
import AppUpdateCard from '../../components/Apps/AppUpdateCard';
import AppsHomeView from '../../components/Apps/AppsHomeView';
import { AppUpdaterState } from '../../hooks/useAppUpdater';
import { AppLauncherEntry } from '../../plugins/appsRegistry';

const createBaseUpdaterState = (overrides?: Partial<AppUpdaterState>): AppUpdaterState => ({
  status: 'available',
  currentVersion: '2.2.2',
  latestVersion: '2.2.3',
  releaseName: 'HappyTool v2.2.3',
  releaseNotes: '- Faster Rust log filtering\n- One-click GitHub auto update',
  publishedAt: '2026-11-23T00:00:00Z',
  htmlUrl: 'https://github.com/sindng-ui/logextractor_rauri/releases/tag/v2.2.3',
  downloadUrl: 'https://github.com/sindng-ui/logextractor_rauri/releases/download/v2.2.3/setup.exe',
  assetName: 'HappyTool Tauri_2.2.3_x64-setup.exe',
  assetSize: 25 * 1024 * 1024,
  progress: null,
  error: null,
  installerPath: null,
  isDevMode: false,
  isDismissed: false,
  skippedVersion: null,
  ...overrides,
});

const createMockApps = (): AppLauncherEntry[] => [
  {
    id: 'LOG_EXTRACTOR',
    name: 'Log Extractor',
    subtitle: 'Log Analyzer',
    description: 'Log analyzer',
    quickHint: 'Drop .log',
    chips: ['1GB+ Rust'],
    icon: FileText,
    gradient: 'from-emerald-500 to-teal-500',
    accentBg: 'bg-emerald-600/85',
    accentText: 'text-emerald-200',
    radialGlow: 'rgba(16, 185, 129, 0.22)',
    dockShadow: '0 8px 20px rgba(16, 185, 129, 0.36)',
    sweepGradient: 'linear-gradient(90deg, transparent, white, transparent)',
    edgeBarClass: 'bg-emerald-400',
    activeRowClass: 'bg-emerald-500/15',
    chipClass: 'bg-emerald-500/15',
    ghostClass: 'text-emerald-300',
    preload: vi.fn().mockResolvedValue(undefined),
    component: React.lazy(async () => ({ default: () => null })),
  },
];

describe('AppUpdateCard & AppsHomeView Updater Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    delete (window as any).electronAPI;
  });

  afterEach(() => {
    cleanup();
    delete (window as any).electronAPI;
    vi.restoreAllMocks();
  });

  it('renders available update details, expands release notes, and triggers callbacks', () => {
    const onUpdateClick = vi.fn();
    const onSkipVersionClick = vi.fn();
    const onDismissClick = vi.fn();

    const { getByText, queryByText, getByLabelText } = render(
      <AppUpdateCard
        state={createBaseUpdaterState()}
        onUpdateClick={onUpdateClick}
        onCancelClick={vi.fn()}
        onRetryClick={vi.fn()}
        onDismissClick={onDismissClick}
        onSkipVersionClick={onSkipVersionClick}
        onOpenReleasePage={vi.fn()}
      />
    );

    expect(getByText('Update Available')).toBeTruthy();
    expect(getByText('v2.2.2 → v2.2.3')).toBeTruthy();
    expect(getByText('25.0 MB')).toBeTruthy();
    expect(queryByText('Faster Rust log filtering')).toBeNull();

    fireEvent.click(getByText("What's new"));
    expect(getByText('Faster Rust log filtering')).toBeTruthy();
    expect(getByText('One-click GitHub auto update')).toBeTruthy();

    fireEvent.click(getByText('Update Now'));
    expect(onUpdateClick).toHaveBeenCalledTimes(1);

    fireEvent.click(getByText('Skip v2.2.3'));
    expect(onSkipVersionClick).toHaveBeenCalledWith('2.2.3');

    fireEvent.click(getByLabelText('Dismiss update notification'));
    expect(onDismissClick).toHaveBeenCalledTimes(1);
  });

  it('renders downloading progress and error recovery states accurately', () => {
    const onCancelClick = vi.fn();
    const onRetryClick = vi.fn();

    const { getByText, rerender } = render(
      <AppUpdateCard
        state={createBaseUpdaterState({
          status: 'downloading',
          progress: {
            downloadedBytes: 10 * 1024 * 1024,
            totalBytes: 25 * 1024 * 1024,
            percent: 40,
            speedBps: 5 * 1024 * 1024,
            stage: 'downloading',
          },
        })}
        onUpdateClick={vi.fn()}
        onCancelClick={onCancelClick}
        onRetryClick={onRetryClick}
        onDismissClick={vi.fn()}
        onSkipVersionClick={vi.fn()}
        onOpenReleasePage={vi.fn()}
      />
    );

    expect(getByText('Downloading HappyTool v2.2.3')).toBeTruthy();
    expect(getByText('40%')).toBeTruthy();
    expect(getByText('10.0 MB / 25.0 MB · 5.0 MB/s')).toBeTruthy();
    fireEvent.click(getByText('Cancel'));
    expect(onCancelClick).toHaveBeenCalledTimes(1);

    rerender(
      <AppUpdateCard
        state={createBaseUpdaterState({
          status: 'error',
          error: 'Connection timed out',
        })}
        onUpdateClick={vi.fn()}
        onCancelClick={vi.fn()}
        onRetryClick={onRetryClick}
        onDismissClick={vi.fn()}
        onSkipVersionClick={vi.fn()}
        onOpenReleasePage={vi.fn()}
      />
    );

    expect(getByText('Update Failed')).toBeTruthy();
    expect(getByText('Connection timed out')).toBeTruthy();
    fireEvent.click(getByText('Retry'));
    expect(onRetryClick).toHaveBeenCalledTimes(1);
  });

  it('AppsHomeView automatically checks GitHub release, renders one-click update, and streams progress', async () => {
    let progressListener: ((p: AppUpdateDownloadProgress) => void) | null = null;
    let resolveInstall: ((res: AppUpdateInstallResult) => void) | null = null;

    const checkAppUpdate = vi.fn().mockResolvedValue({
      status: 'available',
      hasUpdate: true,
      currentVersion: '2.2.2',
      latestVersion: '2.2.4',
      releaseName: 'HappyTool v2.2.4',
      releaseNotes: '- Critical performance boost',
      publishedAt: '2026-11-23T01:00:00Z',
      htmlUrl: 'https://github.com/sindng-ui/logextractor_rauri/releases/tag/v2.2.4',
      downloadUrl: 'https://github.com/sindng-ui/logextractor_rauri/releases/download/v2.2.4/setup.exe',
      assetName: 'HappyTool Tauri_2.2.4_x64-setup.exe',
      assetSize: 20_000_000,
      etag: '"v224"',
      isDevMode: false,
    });

    const downloadAndInstallUpdate = vi.fn().mockImplementation(
      () =>
        new Promise<AppUpdateInstallResult>((resolve) => {
          resolveInstall = resolve;
        })
    );

    (window as any).electronAPI = {
      checkAppUpdate,
      downloadAndInstallUpdate,
      cancelAppUpdate: vi.fn().mockResolvedValue(undefined),
      onUpdateDownloadProgress: vi.fn((cb) => {
        progressListener = cb;
        return () => {
          progressListener = null;
        };
      }),
      openExternal: vi.fn().mockResolvedValue({ status: 'success' }),
    };

    const { getByText, queryByText } = render(
      <AppsHomeView
        apps={createMockApps()}
        onSelectApp={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(checkAppUpdate).toHaveBeenCalledTimes(1);
      expect(getByText('Update Available')).toBeTruthy();
      expect(getByText('v2.2.2 → v2.2.4')).toBeTruthy();
    });

    fireEvent.click(getByText('Update Now'));

    await waitFor(() => {
      expect(downloadAndInstallUpdate).toHaveBeenCalledWith({
        downloadUrl: 'https://github.com/sindng-ui/logextractor_rauri/releases/download/v2.2.4/setup.exe',
        assetName: 'HappyTool Tauri_2.2.4_x64-setup.exe',
        expectedSize: 20_000_000,
      });
      expect(getByText('Downloading HappyTool v2.2.4')).toBeTruthy();
    });

    act(() => {
      progressListener?.({
        downloadedBytes: 10_000_000,
        totalBytes: 20_000_000,
        percent: 50,
        speedBps: 4_000_000,
        stage: 'downloading',
      });
    });

    expect(getByText('50%')).toBeTruthy();

    await act(async () => {
      resolveInstall?.({ status: 'installing', message: 'Installing...' });
    });

    expect(getByText('Installing & Restarting...')).toBeTruthy();
    expect(queryByText('Cancel')).toBeNull();
  });

  it('ignores stale localStorage cache and ETag when runtime app version changed', async () => {
    localStorage.setItem(
      'happytool_update_cache_v1',
      JSON.stringify({
        checkedAt: Date.now() - 1000 * 60 * 60, // expired TTL, has stale etag
        etag: '"stale-etag"',
        result: {
          status: 'up_to_date',
          hasUpdate: false,
          currentVersion: '2.2.2',
          isDevMode: true,
        },
      })
    );

    const checkAppUpdate = vi.fn().mockResolvedValue({
      status: 'available',
      hasUpdate: true,
      currentVersion: '1.0.0',
      latestVersion: '2.2.2',
      releaseName: 'HappyTool v2.2.2',
      releaseNotes: '- Release build',
      publishedAt: '2026-11-23T00:00:00Z',
      htmlUrl: 'https://github.com/sindng-ui/logextractor_rauri/releases/tag/v2.2.2',
      downloadUrl: 'https://github.com/sindng-ui/logextractor_rauri/releases/download/v2.2.2/setup.exe',
      assetName: 'HappyTool Tauri_2.2.2_x64-setup.exe',
      assetSize: 15_000_000,
      etag: '"fresh-etag"',
      isDevMode: true,
    });

    (window as any).electronAPI = {
      getAppVersion: vi.fn().mockResolvedValue('1.0.0'),
      checkAppUpdate,
      onUpdateDownloadProgress: vi.fn(() => () => {}),
    };

    const { getByText } = render(
      <AppsHomeView
        apps={createMockApps()}
        onSelectApp={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(checkAppUpdate).toHaveBeenCalledWith(null);
      expect(getByText('v1.0.0')).toBeTruthy();
      expect(getByText('v1.0.0 → v2.2.2')).toBeTruthy();
    });
  });
});
