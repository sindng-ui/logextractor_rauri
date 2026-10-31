import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArchivedLog } from './db/LogArchiveDB';
import { useLogArchiveContext } from './LogArchiveProvider';
import { useLogArchive } from './hooks/useLogArchive';
import { useToast } from '../../contexts/ToastContext';
import { countLines, decodeHtmlEntities } from './utils';
import { ConfirmDialog } from '../ui/CommonDialogs';

// Optimized Sub-components
import { ViewerHeader } from './ArchiveViewer/ViewerHeader';
import { ViewerMetadata } from './ArchiveViewer/ViewerMetadata';
import { ViewerMemo } from './ArchiveViewer/ViewerMemo';
import { ViewerContent } from './ArchiveViewer/ViewerContent';

interface ArchiveViewerPaneProps {
    /**
     * 표시할 아카이브
     */
    archive: ArchivedLog | null;

    /**
     * 닫기 핸들러
     */
    onClose: () => void;

    /**
     * 원본 로그로 이동 핸들러 (선택)
     */
    onGoToSource?: (sourceFile: string, lineStart: number) => void;
}

/**
 * Archive Viewer Pane (Optimized)
 * 
 * 선택한 아카이브의 상세 내용을 표시하는 하단 패널.
 * 하위 컴포넌트 분할 및 React.memo를 통해 대용량 로그 처리 성능을 최적화했습니다.
 * 500줄 이상의 거대 파일을 기능별로 분리하여 유지보수성을 높였습니다.
 */
export function ArchiveViewerPane({
    archive,
    onClose,
    onGoToSource,
}: ArchiveViewerPaneProps) {
    const { deleteArchive, updateArchive } = useLogArchive();
    const { loadArchiveToTab, closeViewer, setSelectedArchive, refreshArchives } = useLogArchiveContext();
    const { addToast } = useToast();

    // Search States
    const [searchTerm, setSearchTerm] = useState('');
    const [submittedTerm, setSubmittedTerm] = useState('');
    const [currentMatchIdx, setCurrentMatchIdx] = useState(0);

    // Memo States
    const [isEditingMemo, setIsEditingMemo] = useState(false);
    const [editMemo, setEditMemo] = useState('');
    const [dialogConfig, setDialogConfig] = useState<any>(null);

    // Reset state when archive changes
    useEffect(() => {
        setSearchTerm('');
        setSubmittedTerm('');
        setCurrentMatchIdx(0);
        setIsEditingMemo(false);
        setEditMemo(archive?.memo || '');
    }, [archive?.id]);

    /**
     * 전체 검색 매치 계산 (submittedTerm 변경 시에만 실행)
     */
    const matches = useMemo(() => {
        if (!submittedTerm || !archive) return [];
        try {
            const escaped = submittedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, 'gi');
            const results = [];
            const decodedContent = decodeHtmlEntities(archive.content);
            let match;
            while ((match = regex.exec(decodedContent)) !== null) {
                results.push({ index: match.index, length: match[0].length });
            }
            return results;
        } catch (e) {
            return [];
        }
    }, [submittedTerm, archive]);

    const lineCount = useMemo(() => archive ? countLines(archive.content) : 0, [archive]);

    /** 매칭 위치로 스크롤 */
    useEffect(() => {
        if (matches.length > 0) {
            requestAnimationFrame(() => {
                const el = document.getElementById(`search-match-${currentMatchIdx}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        }
    }, [currentMatchIdx, matches.length, submittedTerm]);

    /** ESC Handler */
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!archive) return;
            if (e.key === 'Escape') {
                if (searchTerm || submittedTerm) {
                    e.preventDefault(); e.stopPropagation();
                    setSearchTerm('');
                    setSubmittedTerm('');
                    return;
                }
                e.preventDefault(); e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [archive, onClose, searchTerm, submittedTerm]);

    // Handlers
    const handleSearch = useCallback((term: string) => {
        setSubmittedTerm(term);
        setSearchTerm(term);
        setCurrentMatchIdx(0);
    }, []);

    const handleNavigateMatch = useCallback((direction: 'next' | 'prev') => {
        if (matches.length === 0) return;
        setCurrentMatchIdx(prev =>
            direction === 'next'
                ? (prev + 1) % matches.length
                : (prev - 1 + matches.length) % matches.length
        );
    }, [matches.length]);

    const handleCopy = useCallback(async () => {
        if (!archive) return;
        const { copyToClipboard: copyFn } = await import('./utils');
        const success = await copyFn(decodeHtmlEntities(archive.content));
        if (success) addToast('Copied to clipboard!', 'success');
    }, [archive, addToast]);

    const handleOpenInTab = useCallback(() => {
        if (!archive || !loadArchiveToTab) return;
        loadArchiveToTab(archive.title, decodeHtmlEntities(archive.content));
        closeViewer();
    }, [archive, loadArchiveToTab, closeViewer]);

    const handleDelete = useCallback(async () => {
        if (!archive?.id) return;
        
        setDialogConfig({
            title: 'Delete Archive',
            description: `Are you sure you want to delete "${archive.title}"? This action cannot be undone.`,
            confirmLabel: 'Delete',
            isDanger: true,
            onConfirm: async () => {
                try {
                    await deleteArchive(archive.id!);
                    onClose();
                } catch (err) {
                    addToast('Failed to delete', 'error');
                }
            }
        });
    }, [archive, deleteArchive, onClose, addToast]);

    const handleMemoSave = useCallback(async () => {
        if (!archive?.id) return;
        const trimmed = editMemo.trim();
        if (trimmed === (archive.memo || '')) {
            setIsEditingMemo(false);
            return;
        }
        try {
            await updateArchive(archive.id, { memo: trimmed || undefined });
            setSelectedArchive({ ...archive, memo: trimmed || undefined });
            setIsEditingMemo(false);
            refreshArchives();
            addToast('Memo saved', 'success');
        } catch (err) {
            addToast('Failed to save memo', 'error');
        }
    }, [archive, editMemo, updateArchive, setSelectedArchive, refreshArchives, addToast]);

    return (
        <AnimatePresence>
            {archive && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="archive-viewer-pane"
                >
                    <motion.div
                        initial={{ scale: 0.98, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.98, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="viewer-modal"
                    >
                        <ViewerHeader
                            archive={archive}
                            searchTerm={searchTerm}
                            submittedTerm={submittedTerm}
                            matchesCount={matches.length}
                            currentMatchIdx={currentMatchIdx}
                            canOpenInTab={!!loadArchiveToTab}
                            onSearch={handleSearch}
                            onNavigateMatch={handleNavigateMatch}
                            onOpenInTab={handleOpenInTab}
                            onCopy={handleCopy}
                            onGoToSource={archive.sourceFile && archive.sourceLineStart !== undefined && onGoToSource
                                ? () => onGoToSource(archive.sourceFile!, archive.sourceLineStart!)
                                : null}
                            onDelete={handleDelete}
                            onClose={onClose}
                        />

                        <ViewerMetadata archive={archive} lineCount={lineCount} />

                        <ViewerMemo
                            memo={archive.memo || ''}
                            isEditing={isEditingMemo}
                            editMemo={editMemo}
                            onToggleEdit={setIsEditingMemo}
                            onEditMemoChange={setEditMemo}
                            onSave={handleMemoSave}
                        />

                        <ViewerContent
                            content={archive.content}
                            submittedTerm={submittedTerm}
                            matches={matches}
                            currentMatchIdx={currentMatchIdx}
                        />
                    </motion.div>
                </motion.div>
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
