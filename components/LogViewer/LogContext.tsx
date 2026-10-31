import React, { createContext, useContext, ReactNode } from 'react';
import { useLogExtractorLogic, LogExtractorLogicProps } from '../../hooks/useLogExtractorLogic';

type LogContextType = ReturnType<typeof useLogExtractorLogic>;

const LogContext = createContext<LogContextType | null>(null);

export const useLogContext = () => {
    const ctx = useContext(LogContext);
    if (!ctx) throw new Error("useLogContext must be used within LogProvider");
    return ctx;
};

interface LogProviderProps extends LogExtractorLogicProps {
    children: ReactNode;
    initialFile?: File | null; // ✅ Add support for direct File object
}

export const LogProvider: React.FC<LogProviderProps> = ({ children, ...props }) => {
    const logic = useLogExtractorLogic(props as LogExtractorLogicProps);
    return (
        <LogContext.Provider value={logic}>
            {children}
        </LogContext.Provider>
    );
};
