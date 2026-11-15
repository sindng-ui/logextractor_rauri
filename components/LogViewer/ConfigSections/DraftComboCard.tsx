import React, { useEffect, useRef, useState } from 'react';
import * as Lucide from 'lucide-react';
import { IconButton } from '../../ui/IconButton';

const { FolderOpen, Plus, X } = Lucide;

interface DraftComboCardProps {
    onCommit: (groupsToAdd: string[][], focusNextBranchIdx?: number) => void;
    onCancel: () => void;
    focusTrigger: number;
}

/**
 * Uncommitted Happy Combo draft card rendering the full combo set layout
 * (root input, branch tree with `+ tag` inputs, and `+ ADD BRANCH` button)
 * without writing to rule state or triggering filtering until submitted.
 */
export const DraftComboCard: React.FC<DraftComboCardProps> = ({
    onCommit,
    onCancel,
    focusTrigger,
}) => {
    const [rootName, setRootName] = useState('');
    const [branches, setBranches] = useState<string[][]>([[]]);
    const [branchDrafts, setBranchDrafts] = useState<string[]>(['']);

    const cardRef = useRef<HTMLDivElement>(null);
    const rootInputRef = useRef<HTMLInputElement>(null);
    const branchInputRefs = useRef<Array<HTMLInputElement | null>>([]);
    const committedRef = useRef(false);
    const interactingInsideRef = useRef(false);

    useEffect(() => {
        if (rootInputRef.current) {
            rootInputRef.current.focus();
            rootInputRef.current.scrollIntoView?.({ block: 'nearest' });
        }
    }, [focusTrigger]);

    const buildGroupsForCommit = (rawRoot: string, rawBranches: string[][], rawBranchDrafts: string[]): string[][] => {
        const trimmedRoot = rawRoot.trim();
        if (!trimmedRoot) return [];

        const built: string[][] = [];
        for (let i = 0; i < rawBranches.length; i++) {
            const tags = rawBranches[i].map(t => t.trim()).filter(Boolean);
            const pendingTag = (rawBranchDrafts[i] || '').trim();
            if (pendingTag) {
                tags.push(pendingTag);
            }
            if (tags.length > 0) {
                built.push([trimmedRoot, ...tags]);
            }
        }

        if (built.length === 0) {
            built.push([trimmedRoot]);
        }
        return built;
    };

    const tryCommit = (focusNextBranchIdx?: number) => {
        if (committedRef.current) return;
        const groups = buildGroupsForCommit(rootName, branches, branchDrafts);
        if (groups.length === 0) return;

        committedRef.current = true;
        onCommit(groups, focusNextBranchIdx);
    };

    const handleAddBranch = () => {
        const nextIdx = branches.length;
        setBranches(prev => [...prev, []]);
        setBranchDrafts(prev => [...prev, '']);
        requestAnimationFrame(() => {
            branchInputRefs.current[nextIdx]?.focus();
        });
    };

    const handleRemoveBranch = (branchIdx: number) => {
        if (branches.length <= 1) {
            setBranches([[]]);
            setBranchDrafts(['']);
            branchInputRefs.current[0]?.focus();
            return;
        }
        setBranches(prev => prev.filter((_, i) => i !== branchIdx));
        setBranchDrafts(prev => prev.filter((_, i) => i !== branchIdx));
    };

    const handleAddTagToBranch = (branchIdx: number, rawValue: string) => {
        const trimmed = rawValue.trim();
        if (!trimmed) return;
        setBranches(prev => prev.map((b, i) => (i === branchIdx ? [...b, trimmed] : b)));
        setBranchDrafts(prev => prev.map((v, i) => (i === branchIdx ? '' : v)));
    };

    const handleRemoveTagFromBranch = (branchIdx: number, tagIdx: number) => {
        setBranches(prev => prev.map((b, i) => (i === branchIdx ? b.filter((_, j) => j !== tagIdx) : b)));
    };

    const handleCardBlur = (e: React.FocusEvent<HTMLDivElement>) => {
        if (interactingInsideRef.current) return;
        if (e.relatedTarget && cardRef.current?.contains(e.relatedTarget as Node)) {
            return;
        }
        if (rootName.trim()) {
            tryCommit();
        }
    };

    const hasRootKeyword = rootName.trim().length > 0;

    return (
        <div
            ref={cardRef}
            onMouseDownCapture={() => {
                interactingInsideRef.current = true;
                requestAnimationFrame(() => {
                    interactingInsideRef.current = false;
                });
            }}
            onBlur={handleCardBlur}
            className="glass rounded-2xl p-4 relative group border border-indigo-500/40 z-10"
        >
            {/* Root Header */}
            <div className="flex items-center gap-3 relative z-10 mb-2">
                <input
                    type="checkbox"
                    checked={false}
                    onChange={() => {
                        if (hasRootKeyword) {
                            tryCommit();
                        } else {
                            rootInputRef.current?.focus();
                        }
                    }}
                    className={`accent-indigo-500 w-4 h-4 ${hasRootKeyword ? 'cursor-pointer' : 'opacity-40 cursor-pointer'}`}
                    title={hasRootKeyword ? 'Enable & search this combo' : 'Enter a root keyword first'}
                />

                <FolderOpen size={14} className="text-indigo-400 shrink-0" />

                <input
                    ref={rootInputRef}
                    autoFocus
                    type="text"
                    value={rootName}
                    placeholder="Enter keyword..."
                    onChange={(e) => setRootName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            if (hasRootKeyword) {
                                tryCommit();
                            }
                        } else if (e.key === 'Tab' && !e.shiftKey) {
                            e.preventDefault();
                            branchInputRefs.current[0]?.focus();
                        } else if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            branchInputRefs.current[0]?.focus();
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            onCancel();
                        }
                    }}
                    className="bg-indigo-900/50 text-indigo-100 placeholder-slate-500 px-3 py-1 rounded-lg text-sm font-bold border border-indigo-500/50 outline-none shadow-lg min-w-[140px]"
                />

                <IconButton
                    variant="ghost"
                    size="sm"
                    icon={<Plus size={14} />}
                    title="Add Branch"
                    className="ml-2 text-indigo-400 hover:bg-indigo-500/20 transition-all"
                    onClick={handleAddBranch}
                />

                <IconButton
                    variant="ghost"
                    size="sm"
                    icon={<X size={14} />}
                    title="Cancel"
                    className="ml-auto text-slate-500 hover:text-red-400 transition-colors"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={onCancel}
                />
            </div>

            {/* Branches Tree */}
            <div className="relative pl-7 space-y-3 mt-3">
                <div className="absolute left-[11px] top-0 bottom-4 w-px bg-slate-800" />

                {branches.map((branchTags, branchIdx) => (
                    <div key={branchIdx} className="relative group/branch flex items-center pr-2">
                        <div className="absolute -left-4 top-[14px] w-4 h-px bg-slate-800" />

                        <div className="flex flex-wrap items-center gap-2 flex-1">
                            {branchTags.map((term, tIdx) => (
                                <React.Fragment key={tIdx}>
                                    {tIdx > 0 && <div className="w-1 h-1 bg-slate-700 rounded-full mx-0.5" />}
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-500/30 text-indigo-200 text-xs font-medium">
                                        {term}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveTagFromBranch(branchIdx, tIdx)}
                                            className="text-indigo-300/70 hover:text-red-400 transition-colors"
                                            title="Remove tag"
                                        >
                                            <X size={10} />
                                        </button>
                                    </span>
                                </React.Fragment>
                            ))}

                            <input
                                ref={(el) => { branchInputRefs.current[branchIdx] = el; }}
                                className="bg-transparent text-[11px] text-slate-500 placeholder-slate-600 focus:text-indigo-300 focus:placeholder-indigo-500/50 focus:outline-none min-w-[60px] py-1 px-2 border border-transparent focus:border-indigo-500/30 rounded-lg transition-all hover:bg-white/5"
                                placeholder="+ tag"
                                value={branchDrafts[branchIdx] || ''}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setBranchDrafts(prev => prev.map((v, i) => (i === branchIdx ? val : v)));
                                }}
                                onKeyDown={(e) => {
                                    const val = e.currentTarget.value;
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (val.trim()) {
                                            handleAddTagToBranch(branchIdx, val);
                                        } else if (hasRootKeyword) {
                                            tryCommit();
                                        }
                                    } else if (e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        if (branchIdx === 0) {
                                            rootInputRef.current?.focus();
                                        } else {
                                            branchInputRefs.current[branchIdx - 1]?.focus();
                                        }
                                    } else if (e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        if (branchIdx < branches.length - 1) {
                                            branchInputRefs.current[branchIdx + 1]?.focus();
                                        } else {
                                            handleAddBranch();
                                        }
                                    } else if (e.key === 'Escape') {
                                        e.preventDefault();
                                        onCancel();
                                    }
                                }}
                            />
                        </div>

                        <IconButton
                            variant="ghost"
                            size="xs"
                            icon={<X size={12} />}
                            className="ml-2 opacity-0 group-hover/branch:opacity-100 transition-opacity text-slate-600 hover:text-red-400"
                            onClick={() => handleRemoveBranch(branchIdx)}
                        />
                    </div>
                ))}

                <div className="relative pl-4 pt-1">
                    <div className="absolute left-[11px] top-4 w-4 h-px bg-slate-800" />
                    <button
                        type="button"
                        onClick={handleAddBranch}
                        className="text-[10px] font-bold text-indigo-400/70 hover:text-indigo-300 flex items-center gap-1 py-1 px-2 rounded hover:bg-indigo-500/10 transition-colors uppercase tracking-wider"
                    >
                        <Plus size={10} /> Add Branch
                    </button>
                </div>
            </div>
        </div>
    );
};
