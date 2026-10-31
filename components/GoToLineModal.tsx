import React, { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRight } from 'lucide-react';

interface GoToLineModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGo: (lineNum: number, pane: 'left' | 'right') => void;
    isDualView: boolean;
    leftTotalLines: number;
    rightTotalLines: number;
    leftFileName?: string;
    rightFileName?: string;
}

const GoToLineModal: React.FC<GoToLineModalProps> = ({
    isOpen, onClose, onGo, isDualView,
    leftTotalLines, rightTotalLines,
    leftFileName, rightFileName
}) => {
    const [lineInput, setLineInput] = useState('');
    const [selectedPane, setSelectedPane] = useState<'left' | 'right'>('left');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setLineInput('');
            // Default to left unless right was last active? For now default left.
            setSelectedPane('left');
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSubmit();
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    const handleSubmit = useCallback(() => {
        const line = parseInt(lineInput, 10);
        const maxLines = selectedPane === 'left' ? leftTotalLines : rightTotalLines;

        if (isNaN(line)) {
            return;
        }

        const targetIndex = Math.max(0, Math.min(maxLines - 1, line - 1));

        onGo(targetIndex, selectedPane);
        onClose();
    }, [lineInput, selectedPane, leftTotalLines, rightTotalLines, onGo, onClose]);

    const handleLineInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        // 숫자만 허용하는 정규식
        if (val === '' || /^\d+$/.test(val)) {
            setLineInput(val);
        }
    }, []);

    const maxLines = selectedPane === 'left' ? leftTotalLines : rightTotalLines;
    const formattedMaxLines = useMemo(() => maxLines.toLocaleString(), [maxLines]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60" onClick={onClose}>
            <div
                className="bg-white dark:bg-slate-900 w-[320px] rounded-xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-150"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/80">
                    <h2 className="text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Go to Line</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {isDualView && (
                        <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-950 rounded-lg">
                            <button
                                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${selectedPane === 'left' ? 'bg-white dark:bg-slate-800 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                onClick={() => setSelectedPane('left')}
                            >
                                Left Pane
                            </button>
                            <button
                                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${selectedPane === 'right' ? 'bg-white dark:bg-slate-800 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                onClick={() => setSelectedPane('right')}
                            >
                                Right Pane
                            </button>
                        </div>
                    )}

                    <div>
                        <div className="relative group">
                            <input
                                ref={inputRef}
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                className="w-full bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-4 text-3xl font-mono text-center text-slate-700 dark:text-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-800"
                                placeholder="00000"
                                value={lineInput}
                                onChange={handleLineInputChange}
                                onKeyDown={(e) => {
                                    e.stopPropagation(); // ✅ 전역 키 이벤트 전파를 원천 차단하여 부하 방지
                                    handleKeyDown(e);
                                }}
                            />
                            {/* Accent Line */}
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-indigo-500 group-focus-within:w-1/2 transition-all duration-300 opacity-50" />
                        </div>
                        <div className="text-center mt-3 text-[10px] font-bold text-slate-400 dark:text-slate-600 tracking-tighter uppercase">
                            Available Range: 1 — {formattedMaxLines}
                        </div>
                    </div>

                    <div className="flex justify-end pt-1">
                        <button
                            onClick={handleSubmit}
                            disabled={!lineInput}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold py-2.5 rounded-lg shadow-lg shadow-indigo-500/20 active:scale-[0.98] transition-all disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <ArrowRight size={16} />
                            JUMP TO LINE
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default memo(GoToLineModal);
