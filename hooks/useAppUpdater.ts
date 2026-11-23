import { useCallback, useEffect, useRef, useState } from 'react';
import {
  checkUpdateViaBrowserFetch,
  clearSkippedVersion,
  getSkippedVersion,
  GITHUB_RELEASES_PAGE_URL,
  isNewerVersion,
  normalizeVersionLabel,
  readUpdateCache,
  setSkippedVersion,
  UPDATE_CACHE_TTL_MS,
  writeUpdateCache,
} from '../utils/appUpdater';

export type AppUpdaterStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'dev-downloaded'
  | 'error';

export interface AppUpdaterState {
  status: AppUpdaterStatus;
  currentVersion: string;
  latestVersion: string | null;
  releaseName: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  htmlUrl: string;
  downloadUrl: string | null;
  assetName: string | null;
  assetSize: number | null;
  progress: AppUpdateDownloadProgress | null;
  error: string | null;
  installerPath: string | null;
  isDevMode: boolean;
  isDismissed: boolean;
  skippedVersion: string | null;
}

const FALLBACK_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.2.2';

export function useAppUpdater() {
  const [state, setState] = useState<AppUpdaterState>(() => ({
    status: 'idle',
    currentVersion: normalizeVersionLabel(FALLBACK_VERSION),
    latestVersion: null,
    releaseName: null,
    releaseNotes: null,
    publishedAt: null,
    htmlUrl: GITHUB_RELEASES_PAGE_URL,
    downloadUrl: null,
    assetName: null,
    assetSize: null,
    progress: null,
    error: null,
    installerPath: null,
    isDevMode: false,
    isDismissed: false,
    skippedVersion: getSkippedVersion(),
  }));

  const isMountedRef = useRef(true);
  const checkInFlightRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const applyCheckResult = useCallback(
    (res: AppUpdateCheckResult, options?: { respectSkipped?: boolean }) => {
      if (!isMountedRef.current) return;
      const currentVer = normalizeVersionLabel(res.currentVersion || FALLBACK_VERSION);
      const latestVer = res.latestVersion ? normalizeVersionLabel(res.latestVersion) : null;
      const hasNewer =
        Boolean(res.hasUpdate) &&
        Boolean(latestVer) &&
        isNewerVersion(latestVer!, currentVer);

      const skipped = getSkippedVersion();
      const isVersionSkipped =
        Boolean(options?.respectSkipped) &&
        Boolean(latestVer) &&
        Boolean(skipped) &&
        latestVer === skipped;

      setState((prev) => ({
        ...prev,
        status: hasNewer ? 'available' : 'up-to-date',
        currentVersion: currentVer,
        latestVersion: latestVer,
        releaseName: res.releaseName ?? null,
        releaseNotes: res.releaseNotes ?? null,
        publishedAt: res.publishedAt ?? null,
        htmlUrl: res.htmlUrl || GITHUB_RELEASES_PAGE_URL,
        downloadUrl: res.downloadUrl ?? null,
        assetName: res.assetName ?? null,
        assetSize: res.assetSize ?? null,
        progress: null,
        error: null,
        installerPath: null,
        isDevMode: Boolean(res.isDevMode),
        isDismissed: isVersionSkipped ? true : false,
        skippedVersion: skipped,
      }));
    },
    []
  );

  const checkForUpdates = useCallback(
    async (force = false) => {
      if (checkInFlightRef.current) return;
      checkInFlightRef.current = true;

      let runtimeCurrent = normalizeVersionLabel(FALLBACK_VERSION);
      if (window.electronAPI?.getAppVersion) {
        try {
          const nativeVer = await window.electronAPI.getAppVersion();
          if (nativeVer) {
            runtimeCurrent = normalizeVersionLabel(nativeVer);
          }
        } catch {
          // keep fallback version
        }
      }

      if (isMountedRef.current) {
        setState((prev) => ({
          ...prev,
          currentVersion: runtimeCurrent,
        }));
      }

      const cached = readUpdateCache();
      const cacheMatchesVersion =
        Boolean(cached) &&
        normalizeVersionLabel(cached?.result.currentVersion) === runtimeCurrent;
      const now = Date.now();

      if (!force && cacheMatchesVersion && cached && now - cached.checkedAt < UPDATE_CACHE_TTL_MS) {
        applyCheckResult(cached.result, { respectSkipped: true });
        checkInFlightRef.current = false;
        return;
      }

      if (isMountedRef.current) {
        setState((prev) => ({
          ...prev,
          currentVersion: runtimeCurrent,
          status: prev.status === 'downloading' || prev.status === 'installing' ? prev.status : 'checking',
          error: null,
        }));
      }

      try {
        const etag = force || !cacheMatchesVersion ? null : cached?.etag ?? null;
        const result = window.electronAPI?.checkAppUpdate
          ? await window.electronAPI.checkAppUpdate(etag)
          : await checkUpdateViaBrowserFetch(runtimeCurrent, etag);

        if (result.status === 'not_modified' && cacheMatchesVersion && cached?.result) {
          const refreshedResult = { ...cached.result, currentVersion: runtimeCurrent };
          writeUpdateCache({ ...cached, checkedAt: Date.now(), result: refreshedResult });
          applyCheckResult(refreshedResult, { respectSkipped: !force });
          return;
        }

        writeUpdateCache({
          checkedAt: Date.now(),
          etag: result.etag ?? cached?.etag ?? null,
          result,
        });

        applyCheckResult(result, { respectSkipped: !force });
      } catch (err) {
        if (!isMountedRef.current) return;
        const message = err instanceof Error ? err.message : String(err);
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: message,
        }));
      } finally {
        checkInFlightRef.current = false;
      }
    },
    [applyCheckResult]
  );

  // Automatic initial check on AppsHomeView mount
  useEffect(() => {
    const isTestEnv =
      typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE === 'test';
    if (isTestEnv && !window.electronAPI?.checkAppUpdate) {
      return;
    }
    void checkForUpdates(false);
  }, [checkForUpdates]);

  // Subscribe to Tauri download progress events while mounted on AppsHomeView
  useEffect(() => {
    const unsub = window.electronAPI?.onUpdateDownloadProgress?.((prog) => {
      if (!isMountedRef.current) return;
      setState((prev) => {
        if (prev.status !== 'downloading' && prev.status !== 'installing') return prev;
        return {
          ...prev,
          status: prog.stage === 'installing' ? 'installing' : 'downloading',
          progress: prog,
        };
      });
    });

    return () => {
      unsub?.();
    };
  }, []);

  const openReleasePage = useCallback(async () => {
    const targetUrl = state.htmlUrl || GITHUB_RELEASES_PAGE_URL;
    if (window.electronAPI?.openExternal) {
      await window.electronAPI.openExternal(targetUrl);
    } else if (typeof window !== 'undefined') {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
  }, [state.htmlUrl]);

  const startOneClickUpdate = useCallback(async () => {
    if (!state.downloadUrl || !state.assetName || !window.electronAPI?.downloadAndInstallUpdate) {
      await openReleasePage();
      return;
    }

    setState((prev) => ({
      ...prev,
      status: 'downloading',
      error: null,
      installerPath: null,
      progress: {
        downloadedBytes: 0,
        totalBytes: prev.assetSize ?? null,
        percent: 0,
        speedBps: 0,
        stage: 'downloading',
      },
    }));

    try {
      const res = await window.electronAPI.downloadAndInstallUpdate({
        downloadUrl: state.downloadUrl,
        assetName: state.assetName,
        expectedSize: state.assetSize ?? null,
      });

      if (!isMountedRef.current) return;

      if (res.status === 'cancelled' || res.status === 'browser_opened') {
        setState((prev) => ({
          ...prev,
          status: 'available',
          progress: null,
          error: null,
        }));
      } else if (res.status === 'dev_downloaded') {
        setState((prev) => ({
          ...prev,
          status: 'dev-downloaded',
          installerPath: res.installerPath ?? null,
          progress: prev.progress ? { ...prev.progress, percent: 100, stage: 'installing' } : null,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          status: 'installing',
        }));
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      const message = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        ...prev,
        status: 'error',
        progress: null,
        error: message,
      }));
    }
  }, [state.downloadUrl, state.assetName, state.assetSize, openReleasePage]);

  const cancelUpdate = useCallback(async () => {
    try {
      await window.electronAPI?.cancelAppUpdate?.();
    } catch {
      // ignore cancel errors
    }
  }, []);

  const dismissUpdate = useCallback(() => {
    setState((prev) => ({ ...prev, isDismissed: true }));
  }, []);

  const skipVersion = useCallback((version: string) => {
    const clean = normalizeVersionLabel(version);
    setSkippedVersion(clean);
    setState((prev) => ({
      ...prev,
      isDismissed: true,
      skippedVersion: clean,
    }));
  }, []);

  const revealDismissedUpdate = useCallback(() => {
    clearSkippedVersion();
    setState((prev) => ({
      ...prev,
      isDismissed: false,
      skippedVersion: null,
    }));
  }, []);

  return {
    state,
    checkForUpdates,
    startOneClickUpdate,
    cancelUpdate,
    dismissUpdate,
    skipVersion,
    revealDismissedUpdate,
    openReleasePage,
  };
}
