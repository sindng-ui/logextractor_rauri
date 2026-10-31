import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Archive, Download, Upload, Trash2, Loader2, SlidersHorizontal, Eye, EyeOff, MoreVertical, HardDrive } from 'lucide-react';
import { SearchOptions } from './db/LogArchiveDB';
import { useArchiveSearch } from './hooks/useArchiveSearch';
import { useLogArchive } from './hooks/useLogArchive';
import { useLogArchiveContext } from './LogArchiveProvider';
import { ArchiveSearchBar } from './ArchiveSearchBar';
import { ArchiveList } from './ArchiveList';
import { downloadJSON, openFileDialog, readFileAsText } from './utils';
import { db } from './db/LogArchiveDB';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmDialog } from '../ui/CommonDialogs';

interface ArchiveSidebarProps {
    /**
     * 사이드바 열림 상태
     */
    isOpen: boolean;

    /**
     * 닫기 핸들러
     */
    onClose: () => void;
}

/**
 * Archive Sidebar
 * 
 * 우측 슬라이딩 드로어로 아카이브 목록 표시
 */
export function ArchiveSidebar({ isOpen, onClose }: ArchiveSidebarProps) {
    const { openViewer, selectedArchive, isViewerOpen } = useLogArchiveContext();
    const { addToast } = useToast();
    const { search, loadMore, results, total, hasMore, isSearching, refresh } = useArchiveSearch(1000);
    const { exportToJSON, importFromJSON, clearAll, getTotalCount } = useLogArchive();

    const [totalCount, setTotalCount] = useState(0);
    const [showActions, setShowActions] = useState(false);
    const [showPreview, setShowPreview] = useState(true);
    const [storageInfo, setStorageInfo] = useState<{ totalBytes: number; count: number; avgBytes: number } | null>(null);
    const [showStoragePanel, setShowStoragePanel] = useState(false);
    const [cleanupDays, setCleanupDays] = useState(30);
    const [isCleaningUp, setIsCleaningUp] = useState(false);
    const [dialogConfig, setDialogConfig] = useState<any>(null);

    // Register refresh function to context
    const { setRefreshArchives } = useLogArchiveContext();
    useEffect(() => {
        setRefreshArchives(() => refresh); // Use the smart refresh!
    }, [setRefreshArchives, refresh]);

    const loadStorageInfo = useCallback(async () => {
        try {
            const info = await db.getStorageUsage();
            setStorageInfo(info);
        } catch (e) {
            console.error('[ArchiveSidebar] Storage info failed:', e);
        }
    }, []);

    const [isContentVisible, setIsContentVisible] = useState(false);
    const [isEntranceDone, setIsEntranceDone] = useState(false);

    /**
     * 초기 로드 및 전체 개수 조회
     */
    useEffect(() => {
        if (isOpen) {
            search({});
            getTotalCount().then(setTotalCount);
            loadStorageInfo();

            // ✅ Performance: 사이드바 애니메이션(300ms)이 끝난 후 리스트를 보여줌으로써 렉 줄임
            const timer = setTimeout(() => setIsContentVisible(true), 350);

            // ✅ Entrance Done: 초기 뿅뿅뿅 애니메이션이 끝난 후 상태 변경 (1초)
            const doneTimer = setTimeout(() => setIsEntranceDone(true), 1000);

            return () => {
                clearTimeout(timer);
                clearTimeout(doneTimer);
            };
        } else {
            setIsContentVisible(false);
            setIsEntranceDone(false);
        }
    }, [isOpen, search, getTotalCount, loadStorageInfo]);

    /**
     * ESC Key Handler
     */
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only close if Viewer is NOT open (Viewer handles its own ESC)
            if (isOpen && !isViewerOpen && e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            }
        };

        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isViewerOpen, onClose]);

    /**
     * 검색 옵션 변경 핸들러
     */
    const handleSearchChange = useCallback(
        (options: SearchOptions, immediate?: boolean) => {
            search(options, immediate);
        },
        [search]
    );

    /**
     * 아카이브 보기
     */
    const handleView = useCallback(
        (archive: any) => {
            openViewer(archive);
        },
        [openViewer]
    );

    /**
     * Export
     */
    const handleExport = useCallback(async () => {
        try {
            const json = await exportToJSON();
            const filename = `archive_export_${new Date().toISOString().split('T')[0]}.json`;
            downloadJSON(json, filename);
        } catch (err) {
            console.error('[ArchiveSidebar] Export failed:', err);
            alert('Export failed.');
        }
    }, [exportToJSON]);

    /**
     * Import
     */
    const handleImport = useCallback(async () => {
        try {
            const file = await openFileDialog('.json');
            if (!file) return;

            const content = await readFileAsText(file);
            const count = await importFromJSON(content);

            alert(`Imported ${count} archives.`);

            // 목록 새로고침
            search({});
            getTotalCount().then(setTotalCount);
        } catch (err) {
            console.error('[ArchiveSidebar] Import failed:', err);
            alert('Import failed.');
        }
    }, [importFromJSON, search, getTotalCount]);

    /**
     * Clear All
     */
    const handleClearAll = useCallback(async () => {
        setDialogConfig({
            title: 'Clear All Archives',
            description: 'Are you sure you want to delete ALL archives? This action cannot be undone.',
            confirmLabel: 'Clear Everything',
            isDanger: true,
            onConfirm: async () => {
                try {
                    await clearAll();
                    addToast('All archives deleted.', 'success');
                    search({}, true);
                    setTotalCount(0);
                } catch (err) {
                    console.error('[ArchiveSidebar] Clear failed:', err);
                    addToast('Delete failed.', 'error');
                }
            }
        });
    }, [clearAll, search, addToast]);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Overlay */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="sidebar-overlay"
                        onClick={onClose}
                    />

                    {/* Sidebar */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="archive-sidebar"
                    >
                        {/* Header */}
                        <div className="sidebar-header">
                            <div className="sidebar-title">
                                <Archive size={20} />
                                <h2>Archive</h2>
                                <span className="archive-count">({totalCount})</span>
                            </div>

                            <div className="sidebar-header-actions">
                                {/* Preview Toggle */}
                                <button
                                    className={`icon-button ${showPreview ? 'text-blue-400' : 'text-slate-500'}`}
                                    onClick={() => setShowPreview(!showPreview)}
                                    title={showPreview ? "Hide Preview" : "Show Preview"}
                                >
                                    {showPreview ? <Eye size={18} /> : <EyeOff size={18} />}
                                </button>

                                {/* Actions Menu Toggle */}
                                <button
                                    className="icon-button"
                                    onClick={() => setShowActions(!showActions)}
                                    title="Actions"
                                >
                                    <MoreVertical size={18} />
                                </button>

                                {/* Close Button */}
                                <button
                                    className="icon-button"
                                    onClick={onClose}
                                    title="Close"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Actions Menu */}
                        {showActions && (
                            <div className="sidebar-actions">
                                <button className="action-button" onClick={handleExport}>
                                    <Download size={16} />
                                    <span>Export JSON</span>
                                </button>

                                <button className="action-button" onClick={handleImport}>
                                    <Upload size={16} />
                                    <span>Import JSON</span>
                                </button>

                                <button className="action-button danger" onClick={handleClearAll}>
                                    <Trash2 size={16} />
                                    <span>Clear All</span>
                                </button>
                            </div>
                        )}

                        {/* Storage Bar */}
                        {storageInfo && (
                            <div style={{
                                padding: '8px 16px',
                                borderBottom: '1px solid rgba(99, 102, 241, 0.08)',
                            }}>
                                <div
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '4px' }}
                                    onClick={() => setShowStoragePanel(p => !p)}
                                >
                                    <HardDrive size={12} style={{ opacity: 0.5 }} />
                                    <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: 'rgba(30, 41, 59, 0.8)', overflow: 'hidden' }}>
                                        <div style={{
                                            height: '100%',
                                            borderRadius: '2px',
                                            width: `${Math.min(100, (storageInfo.totalBytes / (100 * 1024 * 1024)) * 100)}%`,
                                            background: storageInfo.totalBytes > 80 * 1024 * 1024 ? '#ef4444'
                                                : storageInfo.totalBytes > 50 * 1024 * 1024 ? '#f59e0b'
                                                    : '#10b981',
                                            transition: 'width 0.3s, background 0.3s',
                                        }} />
                                    </div>
                                    <span style={{ fontSize: '10px', color: '#64748b', whiteSpace: 'nowrap' }}>
                                        {storageInfo.totalBytes < 1024 * 1024
                                            ? `${(storageInfo.totalBytes / 1024).toFixed(0)}KB`
                                            : `${(storageInfo.totalBytes / (1024 * 1024)).toFixed(1)}MB`}
                                        {' / '}{storageInfo.count} items
                                    </span>
                                </div>

                                {showStoragePanel && (
                                    <div style={{
                                        marginTop: '8px',
                                        padding: '8px 12px',
                                        background: 'rgba(15, 23, 42, 0.4)',
                                        borderRadius: '8px',
                                        fontSize: '11px',
                                        color: '#94a3b8',
                                    }}>
                                        <div style={{ marginBottom: '6px' }}>
                                            Average Size: {storageInfo.avgBytes < 1024 ? `${storageInfo.avgBytes}B` : storageInfo.avgBytes < 1024 * 1024 ? `${(storageInfo.avgBytes / 1024).toFixed(1)}KB` : `${(storageInfo.avgBytes / (1024 * 1024)).toFixed(1)}MB`}
                                        </div>
                                        {/* Cleanup by Date */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                            <input
                                                type="number"
                                                min={1}
                                                max={365}
                                                value={cleanupDays}
                                                onChange={(e) => setCleanupDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 30)))}
                                                style={{
                                                    width: '50px',
                                                    padding: '2px 6px',
                                                    background: 'rgba(30, 41, 59, 0.6)',
                                                    border: '1px solid rgba(99, 102, 241, 0.2)',
                                                    borderRadius: '4px',
                                                    color: '#e2e8f0',
                                                    fontSize: '11px',
                                                    textAlign: 'center',
                                                }}
                                            />
                                            <span>days older</span>
                                            <button
                                                onClick={async () => {
                                                    setDialogConfig({
                                                        title: 'Cleanup Archives',
                                                        description: `Delete all archives older than ${cleanupDays} days?`,
                                                        confirmLabel: 'Delete Old Archives',
                                                        isDanger: true,
                                                        onConfirm: async () => {
                                                            setIsCleaningUp(true);
                                                            try {
                                                                const deleted = await db.deleteOlderThan(cleanupDays);
                                                                addToast(`Deleted ${deleted} archives`, 'success');
                                                                search({}, true);
                                                                getTotalCount().then(setTotalCount);
                                                                loadStorageInfo();
                                                            } catch (e) {
                                                                console.error('[ArchiveSidebar] Cleanup failed:', e);
                                                                addToast('Cleanup failed', 'error');
                                                            } finally {
                                                                setIsCleaningUp(false);
                                                            }
                                                        }
                                                    });
                                                }}
                                                disabled={isCleaningUp}
                                                style={{
                                                    padding: '2px 10px',
                                                    background: 'rgba(239, 68, 68, 0.2)',
                                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                                    borderRadius: '4px',
                                                    color: '#f87171',
                                                    fontSize: '11px',
                                                    cursor: isCleaningUp ? 'not-allowed' : 'pointer',
                                                    marginLeft: 'auto',
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </div>

                                        {/* Cleanup by Size */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                            <input
                                                type="number"
                                                min={1}
                                                placeholder="Size"
                                                id="deleteSizeInput"
                                                defaultValue={10}
                                                style={{
                                                    width: '50px',
                                                    padding: '2px 6px',
                                                    background: 'rgba(30, 41, 59, 0.6)',
                                                    border: '1px solid rgba(99, 102, 241, 0.2)',
                                                    borderRadius: '4px',
                                                    color: '#e2e8f0',
                                                    fontSize: '11px',
                                                    textAlign: 'center',
                                                }}
                                            />
                                            <span>MB larger</span>
                                            <button
                                                onClick={async () => {
                                                    const input = document.getElementById('deleteSizeInput') as HTMLInputElement;
                                                    const sizeMB = parseInt(input.value) || 10;

                                                    setDialogConfig({
                                                        title: 'Cleanup Large Archives',
                                                        description: `Delete all archives larger than ${sizeMB}MB?`,
                                                        confirmLabel: 'Delete Large Archives',
                                                        isDanger: true,
                                                        onConfirm: async () => {
                                                            setIsCleaningUp(true);
                                                            try {
                                                                const sizeBytes = sizeMB * 1024 * 1024;
                                                                const deleted = await db.deleteLargerThan(sizeBytes);

                                                                if (deleted > 0) {
                                                                    addToast(`Deleted ${deleted} large archives`, 'success');
                                                                } else {
                                                                    addToast('No archives found to delete.', 'info');
                                                                }

                                                                search({}, true);
                                                                getTotalCount().then(setTotalCount);
                                                                loadStorageInfo();
                                                            } catch (e) {
                                                                console.error('[ArchiveSidebar] Cleanup large files failed:', e);
                                                                addToast('Failed to delete large archives', 'error');
                                                            } finally {
                                                                setIsCleaningUp(false);
                                                            }
                                                        }
                                                    });
                                                }}
                                                disabled={isCleaningUp}
                                                style={{
                                                    padding: '2px 10px',
                                                    background: 'rgba(239, 68, 68, 0.2)',
                                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                                    borderRadius: '4px',
                                                    color: '#f87171',
                                                    fontSize: '11px',
                                                    cursor: isCleaningUp ? 'not-allowed' : 'pointer',
                                                    marginLeft: 'auto',
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Search Bar */}
                        <ArchiveSearchBar
                            onSearchChange={handleSearchChange}
                            isSearching={isSearching}
                        />

                        {/* Results Info */}
                        <div className="sidebar-results-info">
                            {isSearching ? (
                                <span>
                                    <Loader2 size={14} className="spinning" />
                                    Searching...
                                </span>
                            ) : (
                                <span>
                                    {results.length} of {total} results
                                </span>
                            )}
                        </div>

                        {/* Archive List */}
                        <div className="sidebar-content">
                            {isContentVisible ? (
                                <ArchiveList
                                    archives={results}
                                    selectedId={selectedArchive?.id}
                                    onView={handleView}
                                    onDelete={() => {
                                        // 삭제 후 즉시 목록 새로고침 (debounce 없이)
                                        search({}, true);
                                        getTotalCount().then(setTotalCount);
                                    }}
                                    onLoadMore={loadMore}
                                    hasMore={hasMore}
                                    isLoading={isSearching}
                                    showPreview={showPreview}
                                    isSidebarReady={true}
                                    isEntranceDone={isEntranceDone}
                                />
                            ) : (
                                <div className="h-full flex items-center justify-center">
                                    <Loader2 size={24} className="spinning text-indigo-500/50" />
                                </div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}

            {dialogConfig && (
                <ConfirmDialog 
                    isOpen={true}
                    onClose={() => setDialogConfig(null)}
                    title={dialogConfig.title}
                    description={dialogConfig.description}
                    confirmLabel={dialogConfig.confirmLabel}
                    isDanger={dialogConfig.isDanger}
                    onConfirm={dialogConfig.onConfirm}
                />
            )}
        </AnimatePresence>
    );
}


