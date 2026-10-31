import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

// Toast Interface & Type
export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration?: number;
}

interface ToastContextType {
    addToast: (message: string, type?: ToastType, duration?: number) => void;
    removeToast: (id: string) => void;
    toasts: Toast[]; // Added
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

// Internal Toast Component (Exported for App.tsx usage)
export const ToastItem: React.FC<{ toast: Toast; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
    const [isExiting, setIsExiting] = useState(false);

    const handleDismiss = () => {
        setIsExiting(true);
        setTimeout(() => {
            onDismiss(toast.id);
        }, 300); // Match animation duration
    };

    // Auto dismiss
    useEffect(() => {
        if (toast.duration) {
            const timer = setTimeout(handleDismiss, toast.duration);
            return () => clearTimeout(timer);
        }
    }, [toast.duration]);

    const getIcon = () => {
        switch (toast.type) {
            case 'success': return <CheckCircle size={18} className="text-emerald-500" />;
            case 'error': return <AlertCircle size={18} className="text-red-500" />;
            case 'warning': return <AlertTriangle size={18} className="text-amber-500" />;
            default: return <Info size={18} className="text-blue-500" />;
        }
    };

    const getStyles = () => {
        switch (toast.type) {
            case 'success': return 'border-emerald-500/20 bg-emerald-500/10 dark:bg-emerald-500/20';
            case 'error': return 'border-red-500/20 bg-red-500/10 dark:bg-red-500/20';
            case 'warning': return 'border-amber-500/20 bg-amber-500/10 dark:bg-amber-500/20';
            default: return 'border-blue-500/20 bg-blue-500/10 dark:bg-blue-500/20';
        }
    };

    return (
        <div
            className={`
                flex items-center gap-3 p-4 rounded-lg border shadow-lg backdrop-blur-md 
                bg-white/90 dark:bg-slate-900/90 text-sm font-medium transition-all duration-300 transform
                ${getStyles()}
                ${isExiting ? 'opacity-0 translate-x-full scale-95' : 'opacity-100 translate-x-0 scale-100'}
            `}
            style={{ zIndex: 9999999 }}
            role="alert"
        >
            <div className="shrink-0">{getIcon()}</div>
            <p className="text-slate-700 dark:text-slate-200">{toast.message}</p>
            <button
                onClick={handleDismiss}
                className="ml-auto p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 transition-colors"
            >
                <X size={14} />
            </button>
        </div>
    );
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((message: string, type: ToastType = 'info', duration = 3000) => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts(prev => {
            const next = [...prev, { id, message, type, duration }];
            return next;
        });
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const contextValue = React.useMemo(() => ({ addToast, removeToast, toasts }), [addToast, removeToast, toasts]);

    return (
        <ToastContext.Provider value={contextValue}>
            {children}
        </ToastContext.Provider>
    );
};
