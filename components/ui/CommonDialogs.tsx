import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Lucide from 'lucide-react';

/**
 * [CommonDialogs]
 * A component responsible for all common popup UIs in HappyTool.
 * Premium animations (Framer Motion) and themes are applied.
 */

interface BaseDialogProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description?: React.ReactNode;
    children?: React.ReactNode;
    confirmLabel: string;
    onConfirm: () => void;
    isDanger?: boolean;
    confirmIcon?: React.ReactNode;
}

const BaseDialog: React.FC<BaseDialogProps> = ({ 
    isOpen, 
    onClose, 
    title, 
    description, 
    children, 
    confirmLabel, 
    onConfirm,
    isDanger = false,
    confirmIcon
}) => {
    // Support closing with ESC key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-950/75"
                    />
                    
                    {/* Dialog Content */}
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
                    >
                        <div className="p-6">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                {confirmIcon ? confirmIcon : (
                                    isDanger 
                                        ? <Lucide.AlertTriangle className="text-red-500" size={20} /> 
                                        : <Lucide.Info className="text-blue-500" size={20} />
                                )}
                                {title}
                            </h3>
                            {description && (
                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                    {description}
                                </p>
                            )}
                            <div className="mt-4">
                                {children}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    onConfirm();
                                    onClose();
                                }}
                                className={`px-4 py-2 text-sm font-bold text-white rounded-lg shadow-lg transition-all active:scale-95 flex items-center gap-2 ${
                                    isDanger 
                                        ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' 
                                        : 'bg-indigo-500 hover:bg-indigo-600 shadow-indigo-500/20'
                                }`}
                            >
                                {confirmLabel}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

/**
 * Confirmation Dialog
 */
export const ConfirmDialog: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: React.ReactNode;
    confirmLabel?: string;
    isDanger?: boolean;
}> = ({ isOpen, onClose, onConfirm, title, description, confirmLabel = "Confirm", isDanger = false }) => (
    <BaseDialog
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        onConfirm={onConfirm}
        isDanger={isDanger}
    />
);

/**
 * Input (Prompt) Dialog
 */
export const PromptDialog: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (value: string) => void;
    title: string;
    description?: string;
    confirmLabel?: string;
    initialValue?: string;
    placeholder?: string;
}> = ({ isOpen, onClose, onConfirm, title, description, confirmLabel = "Save", initialValue = "", placeholder = "" }) => {
    const [value, setValue] = useState(initialValue);

    useEffect(() => {
        if (isOpen) setValue(initialValue);
    }, [isOpen, initialValue]);

    return (
        <BaseDialog
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            description={description}
            confirmLabel={confirmLabel}
            onConfirm={() => value.trim() !== "" && onConfirm(value.trim())}
        >
            <input 
                autoFocus
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && value.trim() !== "") {
                        onConfirm(value.trim());
                        onClose();
                    }
                }}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-400"
                placeholder={placeholder}
            />
        </BaseDialog>
    );
};
