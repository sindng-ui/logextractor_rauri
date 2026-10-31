/**
 * LogPresetDropdown.tsx
 * 스마트 프리셋 관리 드롭다운 컴포넌트 🐧🏷️
 */

import React, { useState, useEffect, useCallback, memo } from 'react';
import { Trash2, Save } from 'lucide-react';
import { useLogContext } from './LogContext';

const LogPresetDropdown: React.FC = memo(() => {
    const {
        currentConfig,
        updateCurrentRule,
    } = useLogContext() as any;

    // Smart Tag Presets States 🐧🏷️
    const [customPresets, setCustomPresets] = useState<{ name: string, tags: string[] }[]>(() => {
        try {
            const saved = localStorage.getItem('happytool_tag_presets');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    });
    const [newPresetName, setNewPresetName] = useState('');
    const [isSavingPreset, setIsSavingPreset] = useState(false);
    const [selectedPresetName, setSelectedPresetName] = useState(''); // Selected preset state for dropdown 🐧✨

    const tags: string[] = currentConfig?.logTags || [];

    // Save custom presets to localStorage
    useEffect(() => {
        try {
            localStorage.setItem('happytool_tag_presets', JSON.stringify(customPresets));
        } catch (e) {
            console.error('Failed to save tag presets', e);
        }
    }, [customPresets]);

    // Apply selected tag preset 🐧⚡
    const handleApplyPreset = useCallback((presetTags: string[]) => {
        if (updateCurrentRule) {
            updateCurrentRule({ logTags: presetTags });
        }
    }, [updateCurrentRule]);

    // Track current tags to auto-match dropdown preset 🐧✨
    useEffect(() => {
        const matched = customPresets.find(p =>
            p.tags.length === tags.length &&
            p.tags.every(t => tags.includes(t)) &&
            tags.every(t => p.tags.includes(t))
        );
        if (matched) {
            setSelectedPresetName(matched.name);
        } else {
            setSelectedPresetName('');
        }
    }, [tags, customPresets]);

    // Handle dropdown select preset 🐧✨
    const handleSelectPreset = useCallback((presetName: string) => {
        setSelectedPresetName(presetName);
        if (!presetName) return;

        const custom = customPresets.find(p => p.name === presetName);
        if (custom) {
            handleApplyPreset(custom.tags);
        }
    }, [customPresets, handleApplyPreset]);

    // Save current tags as a custom preset
    const handleSavePreset = useCallback(() => {
        const name = newPresetName.trim();
        if (!name) return;
        const currentTags = currentConfig?.logTags || [];
        if (currentTags.length === 0) return;

        // Prevent duplicate names
        if (customPresets.some(p => p.name.toLowerCase() === name.toLowerCase())) {
            return;
        }

        setCustomPresets(prev => [...prev, { name, tags: currentTags }]);
        setNewPresetName('');
        setIsSavingPreset(false);
    }, [newPresetName, currentConfig, customPresets]);

    // Delete custom preset
    const handleDeletePreset = useCallback((nameToDelete: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setCustomPresets(prev => prev.filter(p => p.name !== nameToDelete));
    }, []);

    return (
        <div className="flex flex-col space-y-2">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-cyan-400 uppercase tracking-widest font-black">
                    Target Log Tags
                </span>

                {/* Presets 드롭다운 🐧🏷️ */}
                <div className="flex items-center gap-1.5 py-0.5 pr-0.5">
                    <select
                        value={selectedPresetName}
                        onChange={(e) => handleSelectPreset(e.target.value)}
                        className="bg-[#101530] text-slate-300 text-[12px] font-black rounded-lg border border-indigo-500/20 focus:ring-1 focus:ring-indigo-500 focus:outline-none p-1.5 cursor-pointer max-w-[170px]"
                    >
                        <option value="">Select Preset...</option>
                        {customPresets.map((p) => (
                            <option key={p.name} value={p.name}>{p.name}</option>
                        ))}
                    </select>

                    {/* 프리셋 선택 시 삭제 쓰레기통 버튼 노출 */}
                    {!!selectedPresetName && (
                        <button
                            type="button"
                            onClick={(e) => {
                                handleDeletePreset(selectedPresetName, e);
                                setSelectedPresetName('');
                            }}
                            className="p-1.5 rounded-lg border border-red-500/20 bg-red-950/20 text-red-400 hover:bg-red-950/40 hover:text-red-300 hover:border-red-400/50 transition-all duration-200 active:scale-90 shrink-0"
                            title="Delete Custom Preset"
                        >
                            <Trash2 size={13} />
                        </button>
                    )}

                    {/* Save Preset Mini Button */}
                    {tags.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setIsSavingPreset(p => !p)}
                            className={`
                                p-1.5 rounded-lg border transition-all duration-200 hover:scale-[1.1] active:scale-[0.9] shrink-0
                                ${isSavingPreset
                                    ? 'bg-indigo-950 border-indigo-400 text-indigo-300'
                                    : 'bg-[#101530] border-indigo-500/20 text-slate-400 hover:text-indigo-300 hover:border-indigo-500/50'
                                }
                            `}
                            title="Save Current Tags as Preset"
                        >
                            <Save size={13} />
                        </button>
                    )}
                </div>
            </div>

            {/* Custom Preset Save Mini Dialog */}
            {isSavingPreset && (
                <div className="flex items-center gap-1.5 p-2 mb-2 rounded-xl border border-indigo-500/20 bg-[#0d1224] animate-fadeIn">
                    <input
                        type="text"
                        value={newPresetName}
                        onChange={e => setNewPresetName(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); handleSavePreset(); }
                            else if (e.key === 'Escape') setIsSavingPreset(false);
                        }}
                        placeholder="Enter Preset Name..."
                        className="flex-1 bg-[#05070e] text-xs text-slate-200 rounded-md border border-indigo-500/20 focus:ring-1 focus:ring-indigo-500 focus:outline-none px-2 py-1 font-bold font-sans"
                        maxLength={15}
                        spellCheck={false}
                    />
                    <button
                        type="button"
                        onClick={handleSavePreset}
                        disabled={!newPresetName.trim()}
                        className="px-2 py-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 text-xs font-black rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
                    >
                        SAVE
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsSavingPreset(false)}
                        className="px-2 py-1 bg-[#141b36] hover:bg-[#1f2952] text-slate-400 hover:text-slate-200 text-xs font-black rounded-md transition-all shrink-0"
                    >
                        CANCEL
                    </button>
                </div>
            )}
        </div>
    );
});

LogPresetDropdown.displayName = 'LogPresetDropdown';
export default LogPresetDropdown;
