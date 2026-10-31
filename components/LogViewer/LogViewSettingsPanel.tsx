/**
 * LogViewSettingsPanel.tsx
 * 우측 Quick View Settings 슬라이딩 패널 컴포넌트 🐧⚙️
 */

import React, { useCallback, memo } from 'react';
import { Eye } from 'lucide-react';
import { useLogContext } from './LogContext';

interface LogViewSettingsPanelProps {
    isExpanded: boolean;
}

const LogViewSettingsPanel: React.FC<LogViewSettingsPanelProps> = memo(({ isExpanded }) => {
    const {
        currentConfig,
        updateCurrentRule,
        logViewPreferences,
        updateLogViewPreferences,
    } = useLogContext() as any;

    const preferences = logViewPreferences || {
        showLineNumbers: true,
        logLevelOpacity: 20,
        levelStyles: []
    };

    const levels = ['V', 'D', 'I', 'W', 'E'];

    const handleLevelToggle = useCallback((level: string) => {
        if (!logViewPreferences || !updateLogViewPreferences) return;
        const newStyles = (logViewPreferences.levelStyles || []).map((s: any) =>
            s.level === level ? { ...s, enabled: !s.enabled } : s
        );
        updateLogViewPreferences({ levelStyles: newStyles });
    }, [logViewPreferences, updateLogViewPreferences]);

    const handleColorChange = useCallback((level: string, color: string) => {
        if (!logViewPreferences || !updateLogViewPreferences) return;
        const newStyles = (logViewPreferences.levelStyles || []).map((s: any) =>
            s.level === level ? { ...s, color } : s
        );
        updateLogViewPreferences({ levelStyles: newStyles });
    }, [logViewPreferences, updateLogViewPreferences]);

    return (
        <div
            className={`
                bg-[#070a14]/60 flex-shrink-0 transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] space-y-4
                ${isExpanded
                    ? 'opacity-100 translate-x-0 visible'
                    : 'opacity-0 translate-x-4 invisible pointer-events-none'
                }
            `}
            style={{
                width: isExpanded ? '320px' : '0px',
                padding: isExpanded ? '20px' : '0px',
                maxHeight: isExpanded ? 'none' : '0px',
                overflow: 'hidden'
            }}
        >
            <div className="flex items-center gap-2 pb-2 border-b border-[#141b36] min-w-[280px]">
                <Eye size={14} className="text-cyan-400 animate-pulse" />
                <span className="text-xs font-black text-slate-300 tracking-wide">Quick View Settings</span>
            </div>

            {/* Font Family & Size Control */}
            <div className="space-y-2 p-3 rounded-xl border border-indigo-500/10 bg-[#141b36]/20">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-300 font-extrabold">Font Settings</span>
                    <span className="text-xs text-slate-500 uppercase tracking-wider font-mono">Family & Size</span>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={preferences.fontFamily || 'Consolas, monospace'}
                        onChange={(e) => updateLogViewPreferences?.({ fontFamily: e.target.value })}
                        className="flex-1 bg-[#101530] text-slate-200 text-xs rounded-lg border border-indigo-500/20 focus:ring-1 focus:ring-indigo-500 focus:outline-none p-1.5 cursor-pointer"
                    >
                        <option value="Consolas, monospace">Consolas</option>
                        <option value="'Courier New', monospace">Courier</option>
                        <option value="'Lucida Console', monospace">Lucida</option>
                        <option value="'Roboto Mono', monospace">Roboto</option>
                        <option value="monospace">Mono</option>
                    </select>
                    <input
                        type="number"
                        min="8"
                        max="24"
                        value={preferences.fontSize || 12}
                        onChange={(e) => {
                            const newSize = parseInt(e.target.value, 10);
                            const newRowHeight = Math.ceil(newSize * 1.5);
                            updateLogViewPreferences?.({
                                fontSize: newSize,
                                rowHeight: newRowHeight
                            });
                        }}
                        className="w-14 bg-[#101530] text-slate-200 text-xs rounded-lg border border-indigo-500/20 focus:ring-1 focus:ring-indigo-500 focus:outline-none p-1.5 text-center font-mono"
                        title="Font Size (px)"
                    />
                </div>
            </div>

            {/* Line Spacing Control */}
            <div className="space-y-2 p-3 rounded-xl border border-indigo-500/10 bg-[#141b36]/20">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-300 font-extrabold">Line Spacing</span>
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500 uppercase">Height</span>
                        <span className="text-xs text-cyan-400 font-mono font-bold">{preferences.rowHeight}px</span>
                    </div>
                </div>
                <input
                    type="range"
                    min="12"
                    max="60"
                    value={preferences.rowHeight}
                    onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val >= 10 && val <= 100) {
                            updateLogViewPreferences?.({ rowHeight: val });
                        }
                    }}
                    className="w-full h-1 bg-indigo-950 rounded-lg appearance-none cursor-pointer accent-indigo-400"
                />
            </div>

            {/* Show Line Numbers Toggle (iOS Style) */}
            <div className="flex items-center justify-between bg-[#141b36]/30 px-3 py-2.5 rounded-xl border border-indigo-500/10 hover:border-indigo-500/20 transition-all duration-300">
                <div className="flex flex-col">
                    <span className="text-xs text-slate-200 font-extrabold">Line Numbers</span>
                    <span className="text-xs text-slate-500 uppercase tracking-wider font-mono">Index & Line Num</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input
                        id="popover-toggle-line-numbers"
                        type="checkbox"
                        checked={preferences.showLineNumbers !== false}
                        onChange={(e) => updateLogViewPreferences?.({ showLineNumbers: e.target.checked })}
                        className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-[#1f294d] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-indigo-500 peer-checked:to-purple-500 peer-checked:after:bg-white peer-checked:after:border-white"></div>
                </label>
            </div>

            {/* Bypass Filters Toggle (iOS Style) 🐧⚡ */}
            <div className="flex items-center justify-between bg-[#141b36]/30 px-3 py-2.5 rounded-xl border border-indigo-500/10 hover:border-indigo-500/20 transition-all duration-300">
                <div className="flex flex-col">
                    <span className="text-xs text-slate-200 font-extrabold">Bypass Filters</span>
                    <span className="text-xs text-slate-500 uppercase tracking-wider font-mono">Show Shell/Raw Text Always</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input
                        id="popover-toggle-bypass-filters"
                        type="checkbox"
                        checked={currentConfig?.showRawLogLines !== false}
                        onChange={(e) => updateCurrentRule?.({ showRawLogLines: e.target.checked })}
                        className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-[#1f294d] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-emerald-500 peer-checked:to-teal-500 peer-checked:after:bg-white peer-checked:after:border-white"></div>
                </label>
            </div>

            {/* Opacity Control */}
            <div className="space-y-2 p-3 rounded-xl border border-indigo-500/10 bg-[#141b36]/20">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-300 font-extrabold">Log Level Colors</span>
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500 uppercase">Opacity</span>
                        <span className="text-xs text-cyan-400 font-mono font-bold">{(preferences.logLevelOpacity ?? 20)}%</span>
                    </div>
                </div>
                <input
                    type="range"
                    min="5"
                    max="100"
                    value={preferences.logLevelOpacity ?? 20}
                    onChange={(e) => updateLogViewPreferences?.({ logLevelOpacity: parseInt(e.target.value, 10) })}
                    className="w-full h-1 bg-indigo-950 rounded-lg appearance-none cursor-pointer accent-indigo-400"
                />
            </div>

            {/* Log Level Toggles */}
            <div className="space-y-2">
                <span className="text-xs text-slate-500 uppercase tracking-widest font-black block">
                    Level Filters & Colors
                </span>
                <div className="grid grid-cols-1 gap-1.5">
                    {levels.map(level => {
                        const style = (preferences.levelStyles || []).find((s: any) => s.level === level) || { level, color: '#000000', enabled: false };
                        return (
                            <div
                                key={level}
                                className="flex items-center justify-between bg-[#141b36]/20 px-3 py-2 rounded-xl border border-indigo-500/10 hover:bg-[#141b36]/40 hover:border-indigo-500/20 transition-all duration-300"
                            >
                                <div className="flex items-center gap-2.5">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={style.enabled}
                                            onChange={() => handleLevelToggle(level)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-7 h-4 bg-[#1f294d] rounded-full peer peer-checked:after:translate-x-3 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-500"></div>
                                    </label>
                                    <span className={`text-xs font-black font-mono transition-colors ${style.enabled ? 'text-indigo-300' : 'text-slate-500'}`}>
                                        {level}
                                    </span>
                                </div>
                                <input
                                    type="color"
                                    value={style.color}
                                    disabled={!style.enabled}
                                    onChange={(e) => handleColorChange(level, e.target.value)}
                                    className={`w-5 h-5 rounded cursor-pointer border border-[#1e295d]/30 bg-transparent p-0 transition-all hover:scale-110 active:scale-95 ${style.enabled ? 'opacity-100' : 'opacity-20 pointer-events-none'}`}
                                    title={style.enabled ? 'Change Color' : 'Enable first'}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
});

LogViewSettingsPanel.displayName = 'LogViewSettingsPanel';
export default LogViewSettingsPanel;
