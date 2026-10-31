import React from 'react';
import { LogArchiveProvider, useLogArchiveContext } from './LogArchiveProvider';
import { FloatingActionButton } from './FloatingActionButton';
import { SaveArchiveDialog } from './SaveArchiveDialog';
import { ArchiveSidebar } from './ArchiveSidebar';
import { ArchiveViewerPane } from './ArchiveViewerPane';

/**
 * LogArchive Main Component
 * 
 * 로그 아카이브 기능의 메인 컴포넌트
 * Provider로 감싸서 사용해야 합니다.
 */
export function LogArchive() {
    const {
        isSidebarOpen,
        isViewerOpen,
        isSaveDialogOpen,
        selectedArchive,
        selectedText,
        closeSidebar,
        closeViewer,
        closeSaveDialog,
    } = useLogArchiveContext();

    return (
        <>
            {/* Save Dialog */}
            <SaveArchiveDialog
                isOpen={isSaveDialogOpen}
                onClose={closeSaveDialog}
                selectedText={selectedText}
            />

            {/* Sidebar */}
            <ArchiveSidebar
                isOpen={isSidebarOpen}
                onClose={closeSidebar}
            />

            {/* Viewer Pane */}
            <ArchiveViewerPane
                archive={selectedArchive}
                onClose={closeViewer}
            />
        </>
    );
}

/**
 * LogArchive with Provider
 * 
 * Provider와 함께 Export하는 래퍼
 */
export function LogArchiveWithProvider() {
    return (
        <LogArchiveProvider>
            <LogArchive />
        </LogArchiveProvider>
    );
}

// Named exports
export { LogArchiveProvider, useLogArchiveContext };
export { useLogArchive } from './hooks/useLogArchive';
export { useArchiveSearch } from './hooks/useArchiveSearch';
export { StatisticsDashboard } from './StatisticsDashboard';
export type { ArchivedLog, SearchOptions } from './db/LogArchiveDB';
export type { SelectedText } from './LogArchiveProvider';
