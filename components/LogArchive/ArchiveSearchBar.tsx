import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, Code, SlidersHorizontal, Folder } from 'lucide-react';
import { SearchOptions } from './db/LogArchiveDB';
import { useLogArchive } from './hooks/useLogArchive';
import { getTagColor } from './utils';

interface ArchiveSearchBarProps {
    /**
     * 검색 옵션 변경 핸들러
     */
    onSearchChange: (options: SearchOptions, immediate?: boolean) => void;

    /**
     * 현재 검색 중 여부
     */
    isSearching?: boolean;
}

/**
 * Archive Search Bar
 * 
 * 아카이브 검색을 위한 검색바 컴포넌트
 * - 텍스트 검색
 * - RegEx 토글
 * - 태그 필터
 * - 정렬 옵션
 * - NEW: 폴더 필터
 */
export function ArchiveSearchBar({ onSearchChange, isSearching = false }: ArchiveSearchBarProps) {
    const { getAllTags, getFolderStatistics } = useLogArchive();

    const [query, setQuery] = useState('');
    const [isRegex, setIsRegex] = useState(false);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [availableTags, setAvailableTags] = useState<string[]>([]);
    const [folderStats, setFolderStats] = useState<Record<string, number>>({});
    const [selectedFolder, setSelectedFolder] = useState<string>('');
    const [sortBy, setSortBy] = useState<'createdAt' | 'title' | 'updatedAt'>('createdAt');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [showFilters, setShowFilters] = useState(false);

    // 이전 쿼리 추적용 Ref (immediate 판단용)
    const prevQueryRef = React.useRef(query);

    /**
     * 태그 및 폴더 목록 로드
     */
    useEffect(() => {
        getAllTags().then(setAvailableTags);
        getFolderStatistics().then(setFolderStats);
    }, [getAllTags, getFolderStatistics]);

    /**
     * 폴더 목록을 개수 많은 순으로 정렬
     */
    const sortedFolders = React.useMemo(() => {
        return Object.entries(folderStats)
            .sort((a, b) => b[1] - a[1]) // 개수 많은 순 (내림차순)
            .map(([folder]) => folder);
    }, [folderStats]);

    /**
     * 검색 옵션 변경 시 콜백 호출
     */
    useEffect(() => {
        const options: SearchOptions = {
            query: query.trim(),
            isRegex,
            tags: selectedTags,
            folder: selectedFolder || undefined,
            sortBy,
            sortOrder,
        };

        // 쿼리가 변경되었으면 Debounce 적용 (immediate=false)
        // 쿼리가 그대로이고 다른 필터만 변경되었으면 즉시 검색 (immediate=true)
        const isQueryChanged = prevQueryRef.current !== query;
        prevQueryRef.current = query;

        const immediate = !isQueryChanged;

        onSearchChange(options, immediate);
    }, [query, isRegex, selectedTags, selectedFolder, sortBy, sortOrder, onSearchChange]);

    /**
     * 태그 토글
     */
    const toggleTag = useCallback((tag: string) => {
        setSelectedTags(prev => {
            if (prev.includes(tag)) {
                return prev.filter(t => t !== tag);
            } else {
                return [...prev, tag];
            }
        });
    }, []);

    /**
     * 검색 초기화
     */
    const handleReset = useCallback(() => {
        setQuery('');
        setIsRegex(false);
        setSelectedTags([]);
        setSelectedFolder('');
        setSortBy('createdAt');
        setSortOrder('desc');
    }, []);

    // Focus Input on Mount
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // Slight delay to ensure animation has started/layout is ready
        const timer = setTimeout(() => {
            inputRef.current?.focus();
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="archive-search-bar">
            {/* Main Search Input */}
            <div className="search-input-container">
                <Search size={18} className="search-icon" />

                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search archives..."
                    className="search-input"
                // Removed disabled={isSearching} to maintain focus
                />

                {query && (
                    <button
                        className="icon-button"
                        onClick={() => setQuery('')}
                        title="Clear search"
                    >
                        <X size={16} />
                    </button>
                )}

                {/* RegEx Toggle */}
                <button
                    className={`toggle-button ${isRegex ? 'active' : ''}`}
                    onClick={() => setIsRegex(!isRegex)}
                    title="Toggle RegEx"
                >
                    <Code size={16} />
                </button>

                {/* Filters Toggle */}
                <button
                    className={`toggle-button ${showFilters ? 'active' : ''}`}
                    onClick={() => setShowFilters(!showFilters)}
                    title="Show filters"
                >
                    <SlidersHorizontal size={16} />
                </button>
            </div>

            {/* Folder Filters (Chips) */}
            {sortedFolders.length > 0 && (
                <div className="folder-filter-container">
                    <button
                        className={`folder-chip ${!selectedFolder ? 'active' : ''}`}
                        onClick={() => setSelectedFolder('')}
                    >
                        All Folders
                    </button>
                    {sortedFolders.map(folder => (
                        <button
                            key={folder}
                            className={`folder-chip ${selectedFolder === folder ? 'active' : ''}`}
                            onClick={() => setSelectedFolder(folder)}
                        >
                            <Folder size={12} className="mr-1" />
                            {folder}
                            <span className="folder-count">({folderStats[folder]})</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Filters Panel */}
            {showFilters && (
                <div className="search-filters">
                    {/* Sort Options */}
                    <div className="filter-group">
                        <label>Sort By</label>
                        <div className="filter-options">
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as any)}
                            >
                                <option value="createdAt">Created Date</option>
                                <option value="updatedAt">Updated Date</option>
                                <option value="title">Title</option>
                            </select>

                            <select
                                value={sortOrder}
                                onChange={(e) => setSortOrder(e.target.value as any)}
                            >
                                <option value="desc">Descending</option>
                                <option value="asc">Ascending</option>
                            </select>
                        </div>
                    </div>

                    {/* Tag Filters */}
                    {availableTags.length > 0 && (
                        <div className="filter-group">
                            <label>Tags</label>
                            <div className="tag-filter-list">
                                {availableTags.map(tag => (
                                    <button
                                        key={tag}
                                        className={`tag-filter-button ${selectedTags.includes(tag) ? 'active' : ''}`}
                                        onClick={() => toggleTag(tag)}
                                        style={{
                                            backgroundColor: selectedTags.includes(tag) ? getTagColor(tag) : undefined,
                                        }}
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Selected Tags */}
                    {selectedTags.length > 0 && (
                        <div className="filter-group">
                            <label>Selected Tags ({selectedTags.length})</label>
                            <div className="selected-tags">
                                {selectedTags.map(tag => (
                                    <span
                                        key={tag}
                                        className="selected-tag"
                                        style={{ backgroundColor: getTagColor(tag) }}
                                    >
                                        {tag}
                                        <button onClick={() => toggleTag(tag)}>
                                            <X size={12} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Reset Button */}
                    <div className="filter-actions">
                        <button
                            className="button-secondary"
                            onClick={handleReset}
                        >
                            Reset Filters
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
