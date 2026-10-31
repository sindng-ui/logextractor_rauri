import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { ArchivedLog } from './db/LogArchiveDB';

/**
 * 선택된 텍스트 정보
 */
export interface SelectedText {
    content: string;
    startLine?: number;
    endLine?: number;
    sourceFile?: string;
}

/**
 * LogArchive Context 타입
 */
export interface LogArchiveContextType {
    // UI 상태
    isSidebarOpen: boolean;
    isViewerOpen: boolean;
    isSaveDialogOpen: boolean;

    // 선택된 아카이브
    selectedArchive: ArchivedLog | null;

    // 선택된 텍스트 (저장용)
    selectedText: SelectedText | null;

    // Actions
    openSidebar: () => void;
    closeSidebar: () => void;
    toggleSidebar: () => void;

    openViewer: (archive: ArchivedLog) => void;
    closeViewer: () => void;

    openSaveDialog: (text: SelectedText) => void;
    closeSaveDialog: () => void;

    setSelectedArchive: (archive: ArchivedLog | null) => void;

    // 아카이브 → Log Extractor 탭으로 로드
    loadArchiveToTab?: (title: string, content: string) => void;
    setLoadArchiveToTab: (fn: ((title: string, content: string) => void) | undefined) => void;

    // 데이터 갱신 트리거
    refreshArchives: () => void;
    setRefreshArchives: (fn: () => void) => void;
}

const LogArchiveContext = createContext<LogArchiveContextType | undefined>(undefined);

/**
 * LogArchive Context Provider
 */
export function LogArchiveProvider({ children }: { children: ReactNode }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isViewerOpen, setIsViewerOpen] = useState(false);
    const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
    const [selectedArchive, setSelectedArchive] = useState<ArchivedLog | null>(null);
    const [selectedText, setSelectedText] = useState<SelectedText | null>(null);
    const [loadArchiveToTab, setLoadArchiveToTabRaw] = useState<((title: string, content: string) => void) | undefined>(undefined);

    // useState에 함수를 저장하려면 래퍼 필요
    const setLoadArchiveToTab = useCallback((fn: ((title: string, content: string) => void) | undefined) => {
        setLoadArchiveToTabRaw(() => fn);
    }, []);

    const openSidebar = useCallback(() => setIsSidebarOpen(true), []);
    const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);
    const toggleSidebar = useCallback(() => setIsSidebarOpen(prev => !prev), []);

    const openViewer = useCallback((archive: ArchivedLog) => {
        setSelectedArchive(archive);
        setIsViewerOpen(true);
    }, []);

    const closeViewer = useCallback(() => {
        setIsViewerOpen(false);
        setSelectedArchive(null);
    }, []);

    const openSaveDialog = useCallback((text: SelectedText) => {
        setSelectedText(text);
        setIsSaveDialogOpen(true);
    }, []);

    const closeSaveDialog = useCallback(() => {
        setIsSaveDialogOpen(false);
        setSelectedText(null);
    }, []);

    const [refreshArchives, setRefreshArchivesRaw] = useState<(() => void)>(() => () => { });

    const setRefreshArchives = useCallback((fn: () => void) => {
        setRefreshArchivesRaw(() => fn);
    }, []);

    const value = useMemo<LogArchiveContextType>(() => ({
        isSidebarOpen,
        isViewerOpen,
        isSaveDialogOpen,
        selectedArchive,
        selectedText,
        openSidebar,
        closeSidebar,
        toggleSidebar,
        openViewer,
        closeViewer,
        openSaveDialog,
        closeSaveDialog,
        setSelectedArchive,
        loadArchiveToTab,
        setLoadArchiveToTab,
        refreshArchives,
        setRefreshArchives,
    }), [
        isSidebarOpen,
        isViewerOpen,
        isSaveDialogOpen,
        selectedArchive,
        selectedText,
        openSidebar,
        closeSidebar,
        toggleSidebar,
        openViewer,
        closeViewer,
        openSaveDialog,
        closeSaveDialog,
        setSelectedArchive,
        loadArchiveToTab,
        setLoadArchiveToTab,
        refreshArchives,
        setRefreshArchives,
    ]);

    return (
        <LogArchiveContext.Provider value={value}>
            {children}
        </LogArchiveContext.Provider>
    );
}

/**
 * LogArchive Context Hook
 */
export function useLogArchiveContext(): LogArchiveContextType {
    const context = useContext(LogArchiveContext);
    if (!context) {
        throw new Error('useLogArchiveContext must be used within LogArchiveProvider');
    }
    return context;
}
