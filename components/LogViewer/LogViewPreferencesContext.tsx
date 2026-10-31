import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getStoredValue, setStoredValue } from '../../utils/db';
import { LogViewPreferences } from '../../types';

export const defaultLogViewPreferences: LogViewPreferences = {
    rowHeight: 20,
    fontSize: 11,
    fontFamily: 'Consolas, monospace',
    levelStyles: [
        { level: 'V', color: '#888888', enabled: false },
        { level: 'D', color: '#00FFFF', enabled: false },
        { level: 'I', color: '#00FF00', enabled: false },
        { level: 'W', color: '#FFA500', enabled: true },
        { level: 'E', color: '#FF0000', enabled: true }
    ],
    showLineNumbers: true
};

interface LogViewPreferencesContextType {
    logViewPreferences: LogViewPreferences;
    setLogViewPreferences: React.Dispatch<React.SetStateAction<LogViewPreferences>>;
    updateLogViewPreferences: (updates: Partial<LogViewPreferences>) => void;
    perfDashboardHeight: number;
    setPerfDashboardHeight: (h: number) => void;
    splitAnalyzerHeight: number;
    setSplitAnalyzerHeight: (h: number) => void;
    handleZoomIn: (source?: 'mouse' | 'keyboard') => void;
    handleZoomOut: (source?: 'mouse' | 'keyboard') => void;
}

const LogViewPreferencesContext = createContext<LogViewPreferencesContextType | null>(null);

export const useLogViewPreferencesContext = () => {
    const ctx = useContext(LogViewPreferencesContext);
    if (!ctx) throw new Error("useLogViewPreferencesContext must be used within LogViewPreferencesProvider");
    return ctx;
};

export const LogViewPreferencesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [logViewPreferences, setLogViewPreferences] = useState<LogViewPreferences>(defaultLogViewPreferences);
    const [perfDashboardHeight, setPerfDashboardHeightState] = useState(320);
    const [splitAnalyzerHeight, setSplitAnalyzerHeightState] = useState(350);

    // 초기 로드 (한 번만 실행)
    useEffect(() => {
        getStoredValue('perfDashboardHeight').then(saved => {
            if (saved) setPerfDashboardHeightState(parseInt(saved) || 320);
        });

        getStoredValue('splitAnalyzerHeight').then(saved => {
            if (saved) setSplitAnalyzerHeightState(parseInt(saved) || 350);
        });

        getStoredValue('logViewPreferences').then(saved => {
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    setLogViewPreferences({ ...defaultLogViewPreferences, ...parsed });
                } catch (e) {
                    console.error('Failed to parse logViewPreferences', e);
                }
            }
        });
    }, []);

    const updateLogViewPreferences = useCallback((updates: Partial<LogViewPreferences>) => {
        setLogViewPreferences(prev => {
            const next = { ...prev, ...updates };

            const standardFormula = (fs: number) => 20 + (fs - 11) * 2;
            const currentFS = next.fontSize || 11;
            const currentRH = next.rowHeight || standardFormula(currentFS);

            if ('rowHeight' in updates || 'fontSize' in updates) {
                next.rowHeightOffset = currentRH - standardFormula(currentFS);
            }

            setStoredValue('logViewPreferences', JSON.stringify(next));
            return next;
        });
    }, []);

    const setPerfDashboardHeight = useCallback((h: number) => {
        setPerfDashboardHeightState(h);
        setStoredValue('perfDashboardHeight', String(h));
    }, []);

    const setSplitAnalyzerHeight = useCallback((h: number) => {
        setSplitAnalyzerHeightState(h);
        setStoredValue('splitAnalyzerHeight', String(h));
    }, []);

    const handleZoomIn = useCallback((source: 'mouse' | 'keyboard' = 'keyboard') => {
        setLogViewPreferences(prev => {
            const currentFontSize = prev.fontSize || 11;
            const newFontSize = Math.min(30, currentFontSize + 1);
            const standardFormula = (fs: number) => 20 + (fs - 11) * 2;
            const currentStandardRowHeight = standardFormula(currentFontSize);
            const rowHeightOffset = prev.rowHeightOffset !== undefined
                ? prev.rowHeightOffset
                : (prev.rowHeight || currentStandardRowHeight) - currentStandardRowHeight;
            const newRowHeight = Math.max(12, standardFormula(newFontSize) + rowHeightOffset);
            
            if (newFontSize !== currentFontSize || prev.rowHeight !== newRowHeight) {
                const next = { ...prev, fontSize: newFontSize, rowHeight: newRowHeight, rowHeightOffset };
                setStoredValue('logViewPreferences', JSON.stringify(next));
                console.log(`[Global Zoom] ${source} IN: Font ${newFontSize}, Row ${newRowHeight}`);
                return next;
            }
            return prev;
        });
    }, []);

    const handleZoomOut = useCallback((source: 'mouse' | 'keyboard' = 'keyboard') => {
        setLogViewPreferences(prev => {
            const currentFontSize = prev.fontSize || 11;
            const newFontSize = Math.max(8, currentFontSize - 1);
            const standardFormula = (fs: number) => 20 + (fs - 11) * 2;
            const currentStandardRowHeight = standardFormula(currentFontSize);
            const rowHeightOffset = prev.rowHeightOffset !== undefined
                ? prev.rowHeightOffset
                : (prev.rowHeight || currentStandardRowHeight) - currentStandardRowHeight;
            const newRowHeight = Math.max(12, standardFormula(newFontSize) + rowHeightOffset);
            
            if (newFontSize !== currentFontSize || prev.rowHeight !== newRowHeight) {
                const next = { ...prev, fontSize: newFontSize, rowHeight: newRowHeight, rowHeightOffset };
                setStoredValue('logViewPreferences', JSON.stringify(next));
                console.log(`[Global Zoom] ${source} OUT: Font ${newFontSize}, Row ${newRowHeight}`);
                return next;
            }
            return prev;
        });
    }, []);

    return (
        <LogViewPreferencesContext.Provider value={{
            logViewPreferences,
            setLogViewPreferences,
            updateLogViewPreferences,
            perfDashboardHeight,
            setPerfDashboardHeight,
            splitAnalyzerHeight,
            setSplitAnalyzerHeight,
            handleZoomIn,
            handleZoomOut
        }}>
            {children}
        </LogViewPreferencesContext.Provider>
    );
};
