import React, { createContext, useContext } from 'react';
import { ToolId, LogRule, AppSettings, SavedRequest, RequestGroup, PostGlobalVariable, RequestHistoryItem, PostGlobalAuth, EnvironmentProfile, NetTrafficSettings } from '../types';

export interface HappyToolContextType {
    // Log Extractor State
    logRules: LogRule[];
    setLogRules: React.Dispatch<React.SetStateAction<LogRule[]>>;

    // Post Tool State
    savedRequests: SavedRequest[];
    setSavedRequests: React.Dispatch<React.SetStateAction<SavedRequest[]>>;
    savedRequestGroups: RequestGroup[];
    setSavedRequestGroups: React.Dispatch<React.SetStateAction<RequestGroup[]>>;
    requestHistory: RequestHistoryItem[];
    setRequestHistory: React.Dispatch<React.SetStateAction<RequestHistoryItem[]>>;
    postGlobalVariables: PostGlobalVariable[];
    setPostGlobalVariables: React.Dispatch<React.SetStateAction<PostGlobalVariable[]>>;

    envProfiles: EnvironmentProfile[];
    setEnvProfiles: React.Dispatch<React.SetStateAction<EnvironmentProfile[]>>;
    activeEnvId: string;
    setActiveEnvId: React.Dispatch<React.SetStateAction<string>>;

    postGlobalAuth: PostGlobalAuth;
    setPostGlobalAuth: React.Dispatch<React.SetStateAction<PostGlobalAuth>>;

    // NetTraffic State
    netTrafficSettings: NetTrafficSettings;
    setNetTrafficSettings: React.Dispatch<React.SetStateAction<NetTrafficSettings>>;

    // Global Actions
    handleExportSettings: () => void;
    handleImportSettings: (settings: AppSettings) => void;

    // Default Output Folder for CLI
    defaultOutputFolder: string;
    setDefaultOutputFolder: React.Dispatch<React.SetStateAction<string>>;

    // Focus Mode (F11)
    isFocusMode: boolean;
    toggleFocusMode: () => void;

    // Configuration Panel State
    configActiveTab: 'settings' | 'commands';
    setConfigActiveTab: React.Dispatch<React.SetStateAction<'settings' | 'commands'>>;

    // Global Settings Modal
    isSettingsOpen: boolean;
    setIsSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;

    // Reactive Ambient Mood
    ambientMood: 'idle' | 'working' | 'error' | 'success';
    setAmbientMood: React.Dispatch<React.SetStateAction<'idle' | 'working' | 'error' | 'success'>>;
}

const HappyToolContext = createContext<HappyToolContextType | undefined>(undefined);

export const HappyToolProvider: React.FC<{
    value: HappyToolContextType;
    children: React.ReactNode;
}> = ({ value, children }) => {
    return <HappyToolContext.Provider value={value}>{children}</HappyToolContext.Provider>;
};

export const useHappyTool = () => {
    const context = useContext(HappyToolContext);
    if (!context) {
        throw new Error('useHappyTool must be used within a HappyToolProvider');
    }
    return context;
};
