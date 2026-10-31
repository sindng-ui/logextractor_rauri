import React, { useState, useEffect } from 'react';
import TopRightActions from './components/TopRightActions';
import { ToolId, LogRule, AppSettings, SavedRequest, RequestGroup, PostGlobalVariable, RequestHistoryItem, PostGlobalAuth, EnvironmentProfile, NetTrafficSettings } from './types';

import { mergeById } from './utils/settingsHelper';
import { SettingsModal } from './components/SettingsModal';
import { HappyToolProvider, HappyToolContextType } from './contexts/HappyToolContext';
import { ToastProvider, useToast, ToastItem } from './contexts/ToastContext';
import { CommandProvider, useCommand } from './contexts/CommandContext';
import { LogArchiveProvider, LogArchive, useLogArchiveContext } from './components/LogArchive';
import PluginContainer from './components/PluginContainer';
import LogExtractor from './components/LogExtractor';
import { HappyPlugin } from './plugins/types';
import CommandPalette from './components/CommandPalette/CommandPalette';
import LoadingSplash from './components/LoadingSplash';
import WindowTitleBarControls from './components/WindowTitleBarControls';
import { Settings, FileUp, FileDown, Archive, FileText } from 'lucide-react';

const LOG_EXTRACTOR_PLUGIN: HappyPlugin = {
  id: ToolId.LOG_EXTRACTOR,
  name: 'Log Extractor',
  icon: FileText,
  component: LogExtractor,
  order: 1
};

const CommandRegistrar: React.FC<{
  setIsSettingsOpen: (open: boolean) => void;
  handleExport: () => void;
  handleImport: () => void;
}> = ({ setIsSettingsOpen, handleExport, handleImport }) => {
  const { registerCommand, unregisterCommand } = useCommand();
  const { openSidebar } = useLogArchiveContext();

  useEffect(() => {
    registerCommand({
      id: 'open-log-archive',
      title: 'Open Log Archive',
      section: 'Tools',
      icon: <Archive size={18} />,
      action: openSidebar,
      shortcut: 'Ctrl+Shift+A'
    });

    registerCommand({
      id: 'global-settings',
      title: 'Open Settings',
      section: 'General',
      icon: <Settings size={18} />,
      action: () => setIsSettingsOpen(true),
      shortcut: 'Ctrl+,'
    });

    registerCommand({
      id: 'export-settings',
      title: 'Export Settings (Json)',
      section: 'General',
      icon: <FileUp size={18} />,
      action: handleExport
    });

    registerCommand({
      id: 'import-settings',
      title: 'Import Settings (Json)',
      section: 'General',
      icon: <FileDown size={18} />,
      action: handleImport
    });

    return () => {
      unregisterCommand('global-settings');
      unregisterCommand('export-settings');
      unregisterCommand('import-settings');
      unregisterCommand('open-log-archive');
    };
  }, [registerCommand, unregisterCommand, setIsSettingsOpen, handleExport, handleImport, openSidebar]);

  return null;
};

const GLOBAL_ZOOM_LOCK = { lastTime: 0 };

const AppContent: React.FC = () => {
  const { toasts, removeToast } = useToast();

  // Loading States
  const [isBackendReady, setIsBackendReady] = useState(false);
  const [isInitialPluginReady, setIsInitialPluginReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  // App-wide state (Settings)
  const [logRules, setLogRules] = useState<LogRule[]>([
    {
      id: '1',
      name: 'New Analysis',
      includeGroups: [['']],
      happyGroups: [],
      excludes: [],
      highlights: [],
      happyCombosCaseSensitive: false,
      blockListCaseSensitive: false,
      colorHighlightsCaseSensitive: false
    }
  ]);
  const [lastApiUrl, setLastApiUrl] = useState('');
  const [lastMethod, setLastMethod] = useState('GET');
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const [savedRequests, setSavedRequests] = useState<SavedRequest[]>([]);
  const [savedRequestGroups, setSavedRequestGroups] = useState<RequestGroup[]>([]);
  const [requestHistory, setRequestHistory] = useState<RequestHistoryItem[]>([]);
  const [envProfiles, setEnvProfiles] = useState<EnvironmentProfile[]>([]);
  const [activeEnvId, setActiveEnvId] = useState<string>('default');
  const [postGlobalAuth, setPostGlobalAuth] = useState<PostGlobalAuth>({ enabled: true, type: 'none' });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const importInputRef = React.useRef<HTMLInputElement>(null);
  const [defaultOutputFolder, setDefaultOutputFolder] = useState<string>('');
  const [netTrafficSettings, setNetTrafficSettings] = useState<NetTrafficSettings>({
    uaPattern: { keywords: 'SC_SERVICE, User agent', template: 'User agent: $(ClientName)/$(ClientVersion)/$(AppName)/$(AppVersion)/$(AppDetail)', enabled: true },
    patterns: [{ id: '1', alias: 'Keywords', keywords: '', extractRegex: '', enabled: true }]
  });

  const [enabledPlugins, setEnabledPlugins] = useState<string[]>([ToolId.LOG_EXTRACTOR]);

  // Focus Mode State (F11)
  const [isFocusMode, setIsFocusMode] = useState(false);
  const toggleFocusMode = React.useCallback(() => setIsFocusMode(prev => !prev), []);

  // Zoom Level State
  const [zoomFactor, setZoomFactor] = useState<number>(1);

  // Reactive Ambient Mood
  const [ambientMood, setAmbientMood] = useState<'idle' | 'working' | 'error' | 'success'>('idle');

  // Configuration Panel Active Tab State
  const [configActiveTab, setConfigActiveTab] = useState<'settings' | 'commands'>('settings');

  // Load settings on mount
  useEffect(() => {
    const saved = localStorage.getItem('devtool_suite_settings');

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.logRules) {
          const migratedRules = parsed.logRules.map((r: any) => {
            let rule = { ...r };
            if (rule.includes && !rule.includeGroups) {
              rule.includeGroups = Array.isArray(rule.includes)
                ? rule.includes.map((i: string) => [i])
                : [[]];
              delete rule.includes;
            }
            if (!rule.highlights) {
              rule.highlights = [];
            }
            return rule;
          });
          setLogRules(migratedRules);
        }
        if (parsed.defaultOutputFolder) setDefaultOutputFolder(parsed.defaultOutputFolder);

        if (parsed.zoomFactor !== undefined) {
          let loadedZoom = Number(parsed.zoomFactor);
          let finalZoom = loadedZoom;
          if (finalZoom > 10) finalZoom = finalZoom / 100;
          if (isNaN(finalZoom) || finalZoom < 0.3 || finalZoom > 5.0) {
            finalZoom = 1.0;
          }
          setZoomFactor(finalZoom);
          if (window.electronAPI?.setZoomFactor) {
            window.electronAPI.setZoomFactor(finalZoom);
          }
        }

        const savedConfigTab = localStorage.getItem('happytool_config_active_tab');
        if (savedConfigTab === 'settings' || savedConfigTab === 'commands') {
          setConfigActiveTab(savedConfigTab);
        }
      } catch (e) {
        console.error(`[App] Failed to load settings: ${e}`);
      }
    }

    setTimeout(() => {
      setIsSettingsLoaded(true);
    }, 150);
  }, []);

  // Auto-save settings with 1s debounce
  useEffect(() => {
    if (!isSettingsLoaded) return;

    const timer = setTimeout(() => {
      const settings: AppSettings = {
        logRules,
        savedRequests,
        savedRequestGroups,
        requestHistory,
        envProfiles,
        activeEnvId,
        postGlobalAuth,
        lastEndpoint: lastApiUrl,
        lastMethod,
        enabledPlugins,
        defaultOutputFolder,
        netTrafficSettings,
        zoomFactor
      };

      try {
        const settingsJson = JSON.stringify(settings);
        localStorage.setItem('devtool_suite_settings', settingsJson);

        if (window.electronAPI?.saveSettingsToFile) {
          window.electronAPI.saveSettingsToFile(settings).catch(err => {
            console.error("Failed to sync settings to file:", err);
          });
        }
      } catch (e) {
        console.error('[App] Failed to save settings:', e);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [isSettingsLoaded, logRules, lastApiUrl, lastMethod, savedRequests, savedRequestGroups, requestHistory, envProfiles, activeEnvId, postGlobalAuth, enabledPlugins, defaultOutputFolder, netTrafficSettings, zoomFactor]);

  useEffect(() => {
    localStorage.setItem('happytool_config_active_tab', configActiveTab);
  }, [configActiveTab]);

  const handleExportSettings = React.useCallback(() => {
    const settings: AppSettings = {
      logRules,
      savedRequests,
      savedRequestGroups,
      envProfiles,
      activeEnvId,
      postGlobalAuth,
      lastEndpoint: lastApiUrl,
      lastMethod,
      enabledPlugins,
      defaultOutputFolder,
      netTrafficSettings,
    };
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'happytool_settings.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [logRules, savedRequests, savedRequestGroups, envProfiles, activeEnvId, postGlobalAuth, lastApiUrl, lastMethod, enabledPlugins, defaultOutputFolder, netTrafficSettings]);

  const handleImportSettings = React.useCallback((settings: AppSettings) => {
    if (settings.logRules) {
      const migratedRules = settings.logRules.map((r: any) => {
        let rule = { ...r };
        if (rule.includes && !rule.includeGroups) {
          rule.includeGroups = Array.isArray(rule.includes) ? rule.includes.map((i: string) => [i]) : [[]];
          delete rule.includes;
        }
        if (!rule.highlights) {
          rule.highlights = [];
        }
        return rule;
      });
      setLogRules(current => mergeById(current, migratedRules));
    }

    if (settings.defaultOutputFolder !== undefined) setDefaultOutputFolder(settings.defaultOutputFolder);
    window.dispatchEvent(new Event('happytool:settings-imported'));
  }, []);

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const onImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const content = ev.target?.result as string;
        const settings = JSON.parse(content);
        handleImportSettings(settings);
      } catch (err) {
        console.error('Failed to parse settings file', err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const postGlobalVariables = React.useMemo(() =>
    envProfiles.find(p => p.id === activeEnvId)?.variables || []
    , [envProfiles, activeEnvId]);

  const setPostGlobalVariables = React.useCallback((action: any) => {
    setEnvProfiles(currentProfiles => {
      const activeIdx = currentProfiles.findIndex(p => p.id === activeEnvId);
      if (activeIdx === -1) return currentProfiles;

      const activeProfile = currentProfiles[activeIdx];
      const newVars = typeof action === 'function'
        ? (action as (prev: PostGlobalVariable[]) => PostGlobalVariable[])(activeProfile.variables)
        : action;

      const newProfiles = [...currentProfiles];
      newProfiles[activeIdx] = { ...activeProfile, variables: newVars };
      return newProfiles;
    });
  }, [activeEnvId]);

  const contextValue: HappyToolContextType = React.useMemo(() => ({
    logRules,
    setLogRules,
    savedRequests,
    setSavedRequests,
    savedRequestGroups,
    setSavedRequestGroups,
    requestHistory,
    setRequestHistory,
    postGlobalVariables,
    setPostGlobalVariables,
    envProfiles,
    setEnvProfiles,
    activeEnvId,
    setActiveEnvId,
    postGlobalAuth,
    setPostGlobalAuth,
    handleExportSettings,
    handleImportSettings,
    defaultOutputFolder,
    setDefaultOutputFolder,
    isFocusMode,
    toggleFocusMode,
    ambientMood,
    setAmbientMood,
    netTrafficSettings,
    setNetTrafficSettings,
    configActiveTab,
    setConfigActiveTab,
    isSettingsOpen,
    setIsSettingsOpen
  }), [
    logRules,
    savedRequests,
    savedRequestGroups,
    requestHistory,
    postGlobalVariables,
    setPostGlobalVariables,
    envProfiles,
    activeEnvId,
    postGlobalAuth,
    handleExportSettings,
    handleImportSettings,
    defaultOutputFolder,
    isFocusMode,
    toggleFocusMode,
    ambientMood,
    netTrafficSettings,
    configActiveTab,
    isSettingsOpen
  ]);

  const handleBackendLoadingComplete = () => {
    setIsBackendReady(true);
  };

  const handlePluginLoaded = React.useCallback(() => {
    setIsInitialPluginReady(true);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && !window.electronAPI) {
      setShowSplash(false);
      return;
    }

    if (window.performance) {
      const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      const isReload = navEntries.length > 0 && navEntries[0].type === 'reload';

      if (isReload && window.electronAPI) {
        setShowSplash(false);
        setIsBackendReady(true);
        setIsInitialPluginReady(true);
        return;
      }
    }

    window.electronAPI?.getStartupStatus?.().then((data: any) => {
      if (data?.isComplete) {
        setIsBackendReady(true);
      }
    });

    window.electronAPI?.on?.('loading-complete', handleBackendLoadingComplete);

    return () => {
      window.electronAPI?.off?.('loading-complete', handleBackendLoadingComplete);
    };
  }, []);

  useEffect(() => {
    if (isBackendReady && !isInitialPluginReady) {
      const timer = setTimeout(() => {
        setIsInitialPluginReady(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isBackendReady, isInitialPluginReady]);

  const handleSplashComplete = () => {
    setShowSplash(false);
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W' || e.key === 't' || e.key === 'T')) {
        e.preventDefault();
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+' || e.code === 'Equal' || e.code === 'NumpadAdd') {
          e.preventDefault();
          e.stopImmediatePropagation();

          const now = Date.now();
          if (now - GLOBAL_ZOOM_LOCK.lastTime < 100) return;
          GLOBAL_ZOOM_LOCK.lastTime = now;

          setZoomFactor(prev => Math.round(Math.min(prev + 0.1, 3.0) * 10) / 10);
        } else if (e.key === '-' || e.key === '_' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
          e.preventDefault();
          e.stopImmediatePropagation();

          const now = Date.now();
          if (now - GLOBAL_ZOOM_LOCK.lastTime < 100) return;
          GLOBAL_ZOOM_LOCK.lastTime = now;

          setZoomFactor(prev => Math.round(Math.max(prev - 0.1, 0.5) * 10) / 10);
        } else if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') {
          e.preventDefault();
          e.stopImmediatePropagation();
          setZoomFactor(1.0);
        }
      }

      if (e.key === 'F11') {
        e.preventDefault();
        const nextState = !isFocusMode;
        setIsFocusMode(nextState);
        if (window.electronAPI?.toggleFullscreen) {
          window.electronAPI.toggleFullscreen(nextState);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true });
  }, [isFocusMode]);

  useEffect(() => {
    if (window.electronAPI?.setZoomFactor) {
      window.electronAPI.setZoomFactor(zoomFactor);
    }
  }, [zoomFactor]);

  return (
    <HappyToolProvider value={contextValue}>
      <CommandRegistrar
        setIsSettingsOpen={setIsSettingsOpen}
        handleExport={handleExportSettings}
        handleImport={handleImportClick}
      />

      <input
        type="file"
        ref={importInputRef}
        className="hidden"
        accept=".json"
        onChange={onImportFileChange}
      />

      <div className={`flex flex-col h-screen w-screen overflow-hidden bg-[#0B0F19] font-sans text-slate-900 dark:text-slate-200 transition-colors duration-300 relative ${isFocusMode ? 'focus-mode' : ''}`}>
        <WindowTitleBarControls isFocusMode={isFocusMode} />
        <div className="flex-1 flex overflow-hidden z-10 relative">
          <main className="flex-1 w-full overflow-hidden relative bg-slate-50 dark:bg-slate-950 min-h-0 transition-colors duration-300">
            {/* TopRightActions moved to TopBar */}
            {/* TopRightActions removed from here */}
            {!isSettingsLoaded ? (
              <div className="flex h-full items-center justify-center text-slate-500">Loading settings...</div>
            ) : (
              <PluginContainer
                plugin={LOG_EXTRACTOR_PLUGIN}
                isActive={true}
                onLoaded={handlePluginLoaded}
              />
            )}
            <SettingsModal
              isOpen={isSettingsOpen}
              onClose={() => setIsSettingsOpen(false)}
              currentStartLineIndex={0}
              enabledPlugins={enabledPlugins}
              setEnabledPlugins={setEnabledPlugins}
            />
            <CommandPalette />
            <LogArchive />
          </main>
        </div>

        {showSplash && (
          <LoadingSplash
            onLoadingComplete={handleSplashComplete}
            waitForPlugins={!isInitialPluginReady}
          />
        )}

        <div className="fixed bottom-6 right-6 z-[999999] flex flex-col gap-3 pointer-events-none">
          <div className="flex flex-col gap-3 items-end pointer-events-auto">
            {toasts.map(toast => (
              <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
            ))}
          </div>
        </div>
      </div>
    </HappyToolProvider>
  );
};

const App: React.FC = () => {
  return (
    <ToastProvider>
      <CommandProvider>
        <LogArchiveProvider>
          <AppContent />
        </LogArchiveProvider>
      </CommandProvider>
    </ToastProvider>
  );
};

export default App;
