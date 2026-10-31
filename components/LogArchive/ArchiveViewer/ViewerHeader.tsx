import React, { useState, useRef, useEffect } from 'react';
import { Search, X, ChevronUp, ChevronDown, Copy, ExternalLink, Trash2, ArrowUpRight, FileText } from 'lucide-react';
import { ArchivedLog } from '../db/LogArchiveDB';
import { decodeHtmlEntities } from '../utils';

interface ViewerHeaderProps {
    archive: ArchivedLog;
    searchTerm: string;
    submittedTerm: string;
    matchesCount: number;
    currentMatchIdx: number;
    canOpenInTab: boolean;
    onSearch: (term: string) => void;
    onNavigateMatch: (direction: 'next' | 'prev') => void;
    onOpenInTab: () => void;
    onCopy: () => void;
    onGoToSource: (() => void) | null;
    onDelete: () => void;
    onClose: () => void;
}

export const ViewerHeader = React.memo(({
    archive,
    searchTerm: initialSearchTerm,
    submittedTerm,
    matchesCount,
    currentMatchIdx,
    canOpenInTab,
    onSearch,
    onNavigateMatch,
    onOpenInTab,
    onCopy,
    onGoToSource,
    onDelete,
    onClose
}: ViewerHeaderProps) => {
    // Local state for immediate typing feedback without parent re-render
    const [localTerm, setLocalTerm] = useState(initialSearchTerm);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Sync with external state if needed (e.g. from ESC handler)
    useEffect(() => {
        setLocalTerm(initialSearchTerm);
    }, [initialSearchTerm]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();

            if (localTerm !== submittedTerm) {
                onSearch(localTerm);
            } else if (matchesCount > 0) {
                onNavigateMatch(e.shiftKey ? 'prev' : 'next');
            }
        }
    };

    /**
     * Shortcut Handler (Ctrl+F)
     */
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
                e.preventDefault();
                e.stopPropagation();
                searchInputRef.current?.focus();
                searchInputRef.current?.select();
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, []);

    return (
        <div className="viewer-header">
            <div className="viewer-title-group">
                <div className={`viewer-icon-badge ${archive.tags.some(t => t.toLowerCase().includes('error')) ? 'error' :
                    archive.tags.some(t => t.toLowerCase().includes('success')) ? 'success' :
                        archive.title.toLowerCase().includes('db') ? 'db' : 'default'
                    }`}>
                    {archive.tags.some(t => t.toLowerCase().includes('error') || t.toLowerCase().includes('fail')) ? <Search size={22} color="#ef4444" /> :
                        archive.title.toLowerCase().includes('db') ? <FileText size={22} color="#f59e0b" /> :
                            <FileText size={22} color="#3b82f6" />}
                </div>
                <div className="viewer-title-text">
                    <span className="viewer-category-label">LOG ARCHIVE</span>
                    <h3 className="viewer-main-title">{decodeHtmlEntities(archive.title)}</h3>
                </div>
            </div>

            <div className="viewer-actions">
                <div className="viewer-search-bar">
                    <Search size={14} className="text-slate-400" />
                    <input
                        ref={searchInputRef}
                        className="viewer-search-input"
                        placeholder="Find..."
                        value={localTerm}
                        onChange={(e) => setLocalTerm(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    {matchesCount > 0 && (
                        <span className="viewer-match-count">
                            {currentMatchIdx + 1}/{matchesCount}
                        </span>
                    )}
                    <div className="viewer-search-actions">
                        <button
                            className="viewer-search-btn"
                            onClick={() => onNavigateMatch('prev')}
                            disabled={matchesCount === 0}
                        >
                            <ChevronUp size={14} />
                        </button>
                        <button
                            className="viewer-search-btn"
                            onClick={() => onNavigateMatch('next')}
                            disabled={matchesCount === 0}
                        >
                            <ChevronDown size={14} />
                        </button>
                    </div>
                </div>

                <div className="viewer-divider"></div>

                {canOpenInTab && (
                    <button className="icon-button" onClick={onOpenInTab} title="Open in Log Extractor Tab">
                        <ArrowUpRight size={16} />
                    </button>
                )}

                <button className="icon-button" onClick={onCopy} title="Copy Content">
                    <Copy size={16} />
                </button>

                {onGoToSource && (
                    <button className="icon-button" onClick={onGoToSource} title="Open Source">
                        <ExternalLink size={16} />
                    </button>
                )}

                <button className="icon-button danger" onClick={onDelete} title="Delete Archive">
                    <Trash2 size={16} />
                </button>

                <button className="icon-button close" onClick={onClose} title="Close (ESC)">
                    <X size={20} />
                </button>
            </div>
        </div>
    );
});
