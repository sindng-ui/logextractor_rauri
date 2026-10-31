import React from 'react';
import { LogViewPreferences, LogLevelStyle, LogLevel } from '../../../types';
import * as Lucide from 'lucide-react';

const { Eye } = Lucide;

interface ViewSettingsSectionProps {
    preferences: LogViewPreferences;
    onUpdate: (updates: Partial<LogViewPreferences>) => void;
}

export const ViewSettingsSection = React.memo<ViewSettingsSectionProps>(({ preferences, onUpdate }) => {

    const handleLevelToggle = (level: LogLevel) => {
        const newStyles = preferences.levelStyles.map(s =>
            s.level === level ? { ...s, enabled: !s.enabled } : s
        );
        onUpdate({ levelStyles: newStyles });
    };

    const handleColorChange = (level: LogLevel, color: string) => {
        const newStyles = preferences.levelStyles.map(s =>
            s.level === level ? { ...s, color } : s
        );
        onUpdate({ levelStyles: newStyles });
    };

    const handleRowHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val) && val >= 10 && val <= 100) {
            onUpdate({ rowHeight: val });
        }
    };

    const levels: LogLevel[] = ['V', 'D', 'I', 'W', 'E'];

    return (
        <div className="p-0">
            <div className="flex items-center justify-between mb-6">
                <label className="text-sm font-bold text-indigo-100 flex items-center gap-2">
                    <Eye size={16} className="text-indigo-400 icon-glow" />
                    View Settings
                </label>
            </div>

            <div className="glass rounded-2xl p-4 border border-indigo-500/10 space-y-4">
                {/* Font Control */}
                <div className="flex items-center justify-between">
                    <label className="text-sm text-slate-300">Font Family</label>
                    <div className="flex items-center gap-2">
                        <select
                            value={preferences.fontFamily || 'Consolas, monospace'}
                            onChange={(e) => onUpdate({ fontFamily: e.target.value })}
                            className="bg-slate-700 text-slate-200 text-xs rounded border border-slate-600 focus:ring-1 focus:ring-indigo-500 focus:outline-none p-1 w-24"
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
                                // Auto-adjust row height for dense log view (approx 1.5x)
                                const newRowHeight = Math.ceil(newSize * 1.5);
                                onUpdate({
                                    fontSize: newSize,
                                    rowHeight: newRowHeight
                                });
                            }}
                            className="w-12 bg-slate-700 text-slate-200 text-xs rounded border border-slate-600 focus:ring-1 focus:ring-indigo-500 focus:outline-none p-1 text-center"
                            title="Font Size (px)"
                        />
                    </div>
                </div>

                {/* Row Height Control */}
                <div className="flex items-center justify-between">
                    <label className="text-sm text-slate-300">Line Spacing (px)</label>
                    <div className="flex items-center gap-2">
                        <input
                            type="range"
                            min="12"
                            max="60"
                            value={preferences.rowHeight}
                            onChange={handleRowHeightChange}
                            className="w-24 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                        <span className="text-xs text-slate-400 font-mono w-6 text-right">{preferences.rowHeight}</span>
                    </div>
                </div>

                {/* Show Line Numbers Toggle */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/40">
                    <div className="flex flex-col">
                        <label className="text-sm text-slate-300 font-medium">Show Line Numbers</label>
                        <span className="text-[10px] text-slate-500 uppercase tracking-tighter opacity-70">Index & Original Line Num</span>
                    </div>
                    <div className="flex items-center">
                        <input
                            id="toggle-line-numbers"
                            type="checkbox"
                            checked={preferences.showLineNumbers !== false}
                            onChange={(e) => onUpdate({ showLineNumbers: e.target.checked })}
                            className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-indigo-500 focus:ring-offset-slate-900 focus:ring-indigo-500/50 cursor-pointer"
                        />
                    </div>
                </div>

                {/* Log Level Colors */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-sm text-slate-300">Log Level Colors</label>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 uppercase">Opacity</span>
                            <input
                                type="range"
                                min="5"
                                max="100"
                                value={preferences.logLevelOpacity ?? 20}
                                onChange={(e) => onUpdate({ logLevelOpacity: parseInt(e.target.value, 10) })}
                                className="w-20 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                            <span className="text-xs text-slate-400 font-mono w-6 text-right">{preferences.logLevelOpacity ?? 20}%</span>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        {levels.map(level => {
                            const style = preferences.levelStyles.find(s => s.level === level) || { level, color: '#000000', enabled: false };
                            return (
                                <div key={level} className="flex items-center justify-between bg-slate-800/50 p-1.5 rounded border border-slate-700/50 hover:bg-slate-800 transition-colors">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={style.enabled}
                                            onChange={() => handleLevelToggle(level)}
                                            className="rounded border-slate-600 bg-slate-700 text-indigo-500 focus:ring-offset-slate-900 focus:ring-indigo-500/50"
                                        />
                                        <span className={`text-xs font-bold font-mono w-4 text-center ${style.enabled ? 'text-slate-200' : 'text-slate-500'}`}>
                                            {level}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={style.color}
                                            disabled={!style.enabled}
                                            onChange={(e) => handleColorChange(level, e.target.value)}
                                            className={`w-6 h-6 rounded cursor-pointer border-none bg-transparent p-0 transition-opacity ${style.enabled ? 'opacity-100' : 'opacity-30'}`}
                                            title={style.enabled ? 'Change Color' : 'Enable to change color'}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
});
