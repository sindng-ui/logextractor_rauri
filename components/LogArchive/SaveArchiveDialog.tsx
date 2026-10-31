import React, { useState, useEffect, useRef, KeyboardEvent, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Tag as TagIcon, Save, Loader2, Folder, Palette, StickyNote } from 'lucide-react';
import { useLogArchive } from './hooks/useLogArchive';
import { useLogArchiveContext } from './LogArchiveProvider';
import { extractFirstLine, suggestTags } from './utils';
import { db } from './db/LogArchiveDB';

/** 컬러 팔레트 상수 (모듈 스코프) — 매 렌더링마다 배열 재생성 방지 */
const COLOR_PALETTE = [
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Purple', value: '#8b5cf6' },
    { name: 'Pink', value: '#ec4899' },
    { name: 'Red', value: '#ef4444' },
    { name: 'Orange', value: '#f97316' },
    { name: 'Yellow', value: '#eab308' },
    { name: 'Green', value: '#10b981' },
    { name: 'Teal', value: '#14b8a6' },
    { name: 'Cyan', value: '#06b6d4' },
    { name: 'Indigo', value: '#6366f1' },
] as const;

interface SaveArchiveDialogProps {
    /**
     * 모달 열림 상태
     */
    isOpen: boolean;

    /**
     * 닫기 핸들러
     */
    onClose: () => void;

    /**
     * 저장할 텍스트 정보
     */
    selectedText: {
        content: string;
        startLine?: number;
        endLine?: number;
        sourceFile?: string;
    } | null;
}

/**
 * Save Archive Dialog
 * 
 * 선택한 로그를 아카이브에 저장하는 모달 다이얼로그
 */
/**
 * 개별 태그 칩 (메모이제이션)
 */
const TagChip = React.memo(({ tag, onRemove, disabled }: { tag: string, onRemove: (tag: string) => void, disabled: boolean }) => (
    <div className="tag-chip">
        <span>{tag}</span>
        <button
            onClick={() => onRemove(tag)}
            disabled={disabled}
            aria-label={`Remove ${tag}`}
        >
            <X size={14} />
        </button>
    </div>
));

/**
 * 태그 입력 및 추천 섹션 (메모이제이션)
 */
const TagSection = React.memo(({
    tags,
    tagInput,
    setTagInput,
    onAddTag,
    onRemoveTag,
    suggestedTags,
    disabled,
    inputRef
}: {
    tags: string[],
    tagInput: string,
    setTagInput: (val: string) => void,
    onAddTag: (tag: string) => void,
    onRemoveTag: (tag: string) => void,
    suggestedTags: string[],
    disabled: boolean,
    inputRef: React.RefObject<HTMLInputElement>
}) => {
    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onAddTag(tagInput);
        } else if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
            onRemoveTag(tags[tags.length - 1]);
        }
    };

    return (
        <div className="form-group">
            <label htmlFor="archive-tags">
                <TagIcon size={16} />
                <span>Tags</span>
            </label>
            <div className="tag-container">
                {tags.map(tag => (
                    <TagChip key={tag} tag={tag} onRemove={onRemoveTag} disabled={disabled} />
                ))}
                <input
                    id="archive-tags"
                    ref={inputRef}
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Add tags..."
                    disabled={disabled}
                    className="tag-input"
                />
            </div>
            {suggestedTags.length > 0 && (
                <div className="suggested-tags">
                    <span className="suggested-tags-label">Suggested:</span>
                    {suggestedTags.map(tag => (
                        <button
                            key={tag}
                            className="suggested-tag"
                            onClick={() => onAddTag(tag)}
                            disabled={disabled || tags.includes(tag)}
                        >
                            {tag}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
});

/**
 * 컬러 팔레트 섹션 (메모이제이션)
 */
const ColorPaletteSection = React.memo(({
    selectedColor,
    onSelectColor,
    disabled
}: {
    selectedColor: string,
    onSelectColor: (color: string) => void,
    disabled: boolean
}) => (
    <div className="form-group">
        <label>
            <Palette size={16} />
            <span>Color Label</span>
        </label>
        <div className="color-palette">
            {COLOR_PALETTE.map(color => (
                <button
                    key={color.value}
                    type="button"
                    className={`color-swatch ${selectedColor === color.value ? 'selected' : ''}`}
                    style={{ backgroundColor: color.value }}
                    onClick={() => onSelectColor(color.value)}
                    disabled={disabled}
                    title={color.name}
                    aria-label={`Select ${color.name}`}
                />
            ))}
        </div>
    </div>
));

/**
 * 폴더 입력 섹션 (메모이제이션)
 */
const FolderSection = React.memo(({
    folderInput,
    setFolderInput,
    sortedFolders,
    disabled
}: {
    folderInput: string,
    setFolderInput: (val: string) => void,
    sortedFolders: string[],
    disabled: boolean
}) => (
    <div className="form-group">
        <label htmlFor="archive-folder">
            <Folder size={16} />
            <span>Folder (Optional)</span>
        </label>
        <input
            id="archive-folder"
            type="text"
            value={folderInput}
            onChange={(e) => setFolderInput(e.target.value)}
            placeholder="Enter folder name..."
            disabled={disabled}
            list="folder-suggestions"
            className="folder-input"
        />
        <datalist id="folder-suggestions">
            {sortedFolders.map(f => (
                <option key={f} value={f} />
            ))}
        </datalist>
    </div>
));

/**
 * 미리보기 섹션 (메모이제이션)
 */
const ContentPreview = React.memo(({ content }: { content?: string }) => {
    const previewText = useMemo(() => {
        if (!content) return '';
        return content.length > 500 ? content.substring(0, 500) + '...' : content;
    }, [content]);

    return (
        <div className="form-group">
            <label>Preview</label>
            <div className="content-preview">
                {previewText}
            </div>
        </div>
    );
});

/**
 * Save Archive Dialog
 * 
 * 선택한 로그를 아카이브에 저장하는 모달 다이얼로그
 */
export const SaveArchiveDialog = React.memo(function SaveArchiveDialog({ isOpen, onClose, selectedText }: SaveArchiveDialogProps) {
    const { saveArchive } = useLogArchive();

    const [title, setTitle] = useState('');
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [availableTags, setAvailableTags] = useState<string[]>([]);
    const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
    const [memo, setMemo] = useState('');
    const [folder, setFolder] = useState<string>('');
    const [folderInput, setFolderInput] = useState<string>('');
    const [folderStats, setFolderStats] = useState<Record<string, number>>({});
    const [selectedColor, setSelectedColor] = useState<string>('#3b82f6');
    const [isSaving, setIsSaving] = useState(false);

    const titleInputRef = useRef<HTMLInputElement>(null);
    const tagInputRef = useRef<HTMLInputElement>(null);

    const sortedFolders = useMemo(() => {
        return Object.entries(folderStats)
            .filter(([folder]) => folder !== 'Uncategorized')
            .sort((a, b) => b[1] - a[1])
            .map(([folder]) => folder);
    }, [folderStats]);

    useEffect(() => {
        if (isOpen && selectedText) {
            const autoTitle = extractFirstLine(selectedText.content);
            setTitle(autoTitle);
            db.getTagStatistics().then(tagStats => {
                const suggested = suggestTags(selectedText.content, tagStats);
                setSuggestedTags(suggested);
            });
            db.getAllTags().then(setAvailableTags);
            db.getFolderStatistics().then(setFolderStats);
            setTimeout(() => titleInputRef.current?.focus(), 100);
        }
    }, [isOpen, selectedText]);

    useEffect(() => {
        if (!isOpen) {
            setTitle('');
            setTags([]);
            setTagInput('');
            setSuggestedTags([]);
            setMemo('');
            setFolder('');
            setFolderInput('');
            setSelectedColor('#3b82f6');
            setIsSaving(false);
        }
    }, [isOpen]);

    const addTag = useCallback((tag: string) => {
        const trimmedTag = tag.trim().toUpperCase();
        if (trimmedTag && !tags.includes(trimmedTag)) {
            setTags(prev => [...prev, trimmedTag]);
            setTagInput('');
        }
    }, [tags]);

    const removeTag = useCallback((tagToRemove: string) => {
        setTags(prev => prev.filter(tag => tag !== tagToRemove));
    }, []);

    const handleSave = useCallback(async () => {
        if (!selectedText || !title.trim()) return;
        setIsSaving(true);
        try {
            await saveArchive({
                title: title.trim(),
                content: selectedText.content,
                tags,
                memo: memo.trim() || undefined,
                sourceFile: selectedText.sourceFile,
                sourceLineStart: selectedText.startLine,
                sourceLineEnd: selectedText.endLine,
                metadata: {
                    folder: folder || undefined,
                    color: selectedColor,
                },
            });
            onClose();
        } catch (err) {
            console.error('[SaveArchiveDialog] Failed to save:', err);
            alert('Failed to save archive.');
        } finally {
            setIsSaving(false);
        }
    }, [selectedText, title, tags, memo, folder, selectedColor, saveArchive, onClose]);

    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Escape') {
            onClose();
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            handleSave();
        }
    }, [onClose, handleSave]);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="modal-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.2 }}
                        className="save-archive-dialog"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="dialog-header">
                            <h2>
                                <Save size={20} />
                                <span>Save to Archive</span>
                            </h2>
                            <button className="icon-button" onClick={onClose} disabled={isSaving}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="dialog-content">
                            <div className="form-group">
                                <label htmlFor="archive-title">Title</label>
                                <input
                                    id="archive-title"
                                    ref={titleInputRef}
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Enter archive title..."
                                    disabled={isSaving}
                                    maxLength={200}
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="archive-memo">
                                    <StickyNote size={16} />
                                    <span>Memo (Optional)</span>
                                </label>
                                <textarea
                                    id="archive-memo"
                                    value={memo}
                                    onChange={(e) => setMemo(e.target.value)}
                                    placeholder="Leave a memo for this log..."
                                    disabled={isSaving}
                                    maxLength={500}
                                    rows={3}
                                    className="memo-textarea"
                                    style={{
                                        width: '100%',
                                        resize: 'vertical',
                                        minHeight: '48px',
                                        maxHeight: '120px',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(99, 102, 241, 0.2)',
                                        backgroundColor: 'rgba(15, 23, 42, 0.5)',
                                        color: '#e2e8f0',
                                        fontSize: '13px',
                                        fontFamily: 'inherit',
                                        outline: 'none',
                                        transition: 'border-color 0.2s',
                                    }}
                                />
                            </div>

                            <TagSection
                                tags={tags}
                                tagInput={tagInput}
                                setTagInput={setTagInput}
                                onAddTag={addTag}
                                onRemoveTag={removeTag}
                                suggestedTags={suggestedTags}
                                disabled={isSaving}
                                inputRef={tagInputRef}
                            />

                            <FolderSection
                                folderInput={folderInput}
                                setFolderInput={(val) => {
                                    setFolderInput(val);
                                    setFolder(val);
                                }}
                                sortedFolders={sortedFolders}
                                disabled={isSaving}
                            />

                            <ColorPaletteSection
                                selectedColor={selectedColor}
                                onSelectColor={setSelectedColor}
                                disabled={isSaving}
                            />

                            <ContentPreview content={selectedText?.content} />
                        </div>

                        <div className="dialog-footer">
                            <button className="button-secondary" onClick={onClose} disabled={isSaving}>
                                Cancel
                            </button>
                            <button
                                className="button-primary"
                                onClick={handleSave}
                                disabled={isSaving || !title.trim()}
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 size={16} className="spinning" />
                                        <span>Saving...</span>
                                    </>
                                ) : (
                                    <>
                                        <Save size={16} />
                                        <span>Save</span>
                                    </>
                                )}
                            </button>
                        </div>

                        <div className="keyboard-hints">
                            <span><kbd>Enter</kbd> Add Tag</span>
                            <span><kbd>Ctrl+Enter</kbd> Save</span>
                            <span><kbd>Esc</kbd> Close</span>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
});
