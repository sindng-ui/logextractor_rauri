import React, { useState, useEffect } from 'react';
import * as Lucide from 'lucide-react';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { LogRule } from '../../../types';

const { Terminal, Play, Square, X } = Lucide;

interface LogSettingsSectionProps {
    currentConfig: LogRule;
    updateCurrentRule: (updates: Partial<LogRule>) => void;
    isLogging: boolean;
    onToggleLogging: () => void;
    connectionMode: 'sdb' | 'ssh' | 'serial' | null;
    hasEverConnected: boolean;     // New prop
    onReconnect: () => void;       // New prop
}

const defaultLogCommand = 'dlogutil -c;logger-mgr --filter $(TAGS); dlogutil -v kerneltime $(TAGS) &';

export const LogSettingsSection = React.memo<LogSettingsSectionProps>(({ currentConfig, updateCurrentRule, isLogging, onToggleLogging, connectionMode, hasEverConnected, onReconnect }) => {
    const [localCommand, setLocalCommand] = useState(currentConfig.logCommand ?? defaultLogCommand);

    useEffect(() => {
        setLocalCommand(currentConfig.logCommand ?? defaultLogCommand);
    }, [currentConfig.logCommand]);

    const handleCommandBlur = () => {
        if (localCommand !== currentConfig.logCommand) {
            updateCurrentRule({ logCommand: localCommand });
        }
    };

    return (
        <div className="p-0">
            <label className="text-sm font-bold text-emerald-200 mb-6 flex items-center gap-2">
                <Terminal size={16} className="text-emerald-400 icon-glow" />
                Log Settings
            </label>

            <div className="glass rounded-2xl p-5 border border-emerald-500/10 space-y-5">
                <div className="flex gap-3">
                    <Button
                        className={`font-bold flex-1 shadow-lg transition-all border ${isLogging
                            ? 'bg-slate-700/50 hover:bg-red-500/80 text-slate-300 hover:text-white border-slate-600 hover:border-red-400 hover:shadow-red-900/40'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40 border-emerald-500/50'
                            }`}
                        icon={isLogging ? <Square size={16} /> : <Play size={16} />}
                        onClick={() => {
                            if (!isLogging && !connectionMode && hasEverConnected) {
                                onReconnect();
                            } else {
                                onToggleLogging();
                            }
                        }}
                        disabled={!connectionMode && !hasEverConnected}
                        title={(!connectionMode && !hasEverConnected) ? "Connect to a Tizen device first" : ""}
                    >
                        {isLogging ? "Stop Logging" : "Start Logging"}
                    </Button>
                </div>

                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block tracking-wider">Log Tags ($(TAGS))</label>
                    <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-700/50 flex flex-wrap gap-2 min-h-[48px] items-center">
                        {(currentConfig.logTags || []).map((tag, idx) => (
                            <div key={idx} className="flex items-center bg-indigo-500/20 text-indigo-200 px-2.5 py-1 rounded-lg text-xs font-bold border border-indigo-500/30">
                                <span>{tag}</span>
                                <IconButton
                                    variant="ghost"
                                    size="xs"
                                    icon={<X size={10} />}
                                    className="ml-1.5 hover:text-white"
                                    onClick={() => {
                                        const newTags = (currentConfig.logTags || []).filter((_, i) => i !== idx);
                                        updateCurrentRule({ logTags: newTags });
                                    }}
                                />
                            </div>
                        ))}
                        <input
                            className="bg-transparent text-xs text-slate-300 placeholder-slate-600 focus:outline-none min-w-[60px] py-1 px-2 hover:bg-white/5 rounded transition-colors"
                            placeholder="+ tag"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                    const newTag = e.currentTarget.value.trim();
                                    const currentTags = currentConfig.logTags || [];
                                    if (!currentTags.includes(newTag)) {
                                        updateCurrentRule({ logTags: [...currentTags, newTag] });
                                    }
                                    e.currentTarget.value = '';
                                } else if (e.key === 'Backspace' && !e.currentTarget.value) {
                                    const currentTags = currentConfig.logTags || [];
                                    if (currentTags.length > 0) {
                                        const newTags = currentTags.slice(0, -1);
                                        updateCurrentRule({ logTags: newTags });
                                    }
                                }
                            }}
                        />
                    </div>
                </div>

                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block tracking-wider">Log Command</label>
                    <textarea
                        className="w-full bg-slate-900/50 text-slate-300 text-xs font-mono p-4 rounded-xl border border-slate-700/50 focus:border-indigo-500/50 focus:bg-slate-900 focus:outline-none resize-none leading-relaxed transition-all shadow-inner"
                        rows={3}
                        value={localCommand}
                        onChange={(e) => setLocalCommand(e.target.value)}
                        onBlur={handleCommandBlur}
                    />

                    <div className="flex items-center mt-3">
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-400 cursor-pointer select-none hover:text-slate-300 transition-colors">
                            <input
                                type="checkbox"
                                checked={currentConfig.showRawLogLines !== false}
                                onChange={(e) => updateCurrentRule({ showRawLogLines: e.target.checked })}
                                className="accent-emerald-500 w-3.5 h-3.5 rounded border-slate-700 bg-slate-800 focus:ring-0 focus:ring-offset-0"
                            />
                            <span>Show Shell/Raw Text Always (Bypass Filters)</span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
});
