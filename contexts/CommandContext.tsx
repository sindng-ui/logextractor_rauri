import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

export interface Command {
    id: string;
    title: string;
    action: () => void;
    section?: string;
    icon?: React.ReactNode;
    shortcut?: string;
    keywords?: string[]; // For fuzzy search
}

interface CommandContextType {
    isOpen: boolean;
    openPalette: () => void;
    closePalette: () => void;
    togglePalette: () => void;
    registerCommand: (command: Command) => void;
    unregisterCommand: (commandId: string) => void;
    commands: Command[];
}

const CommandContext = createContext<CommandContextType | undefined>(undefined);

export const useCommand = () => {
    const context = useContext(CommandContext);
    if (!context) {
        throw new Error('useCommand must be used within a CommandProvider');
    }
    return context;
};

export const CommandProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [commands, setCommands] = useState<Command[]>([]);

    const openPalette = useCallback(() => setIsOpen(true), []);
    const closePalette = useCallback(() => setIsOpen(false), []);
    const togglePalette = useCallback(() => setIsOpen(prev => !prev), []);

    const registerCommand = useCallback((command: Command) => {
        setCommands(prev => {
            if (prev.find(c => c.id === command.id)) return prev;
            return [...prev, command];
        });
    }, []);

    const unregisterCommand = useCallback((commandId: string) => {
        setCommands(prev => prev.filter(c => c.id !== commandId));
    }, []);

    // Global Shortcut Listener
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!e.key) return; // Safety check for undefined key

            const key = e.key.toLowerCase();
            const ctrl = e.ctrlKey || e.metaKey;
            const shift = e.shiftKey;
            const alt = e.altKey;

            // Palette Toggle (Standard)
            if (ctrl && (key === 'k' || key === 'p')) {
                e.preventDefault();
                togglePalette();
                return;
            }

            // Check dynamically registered shortcuts
            for (const cmd of commands) {
                if (!cmd.shortcut || typeof cmd.shortcut !== 'string') continue;

                const parts = cmd.shortcut.toLowerCase().split('+');
                const hasCtrl = parts.includes('ctrl') || parts.includes('cmd');
                const hasShift = parts.includes('shift');
                const hasAlt = parts.includes('alt');
                const mainKey = parts[parts.length - 1];

                // Special handling for comma
                const targetKey = mainKey === ',' ? ',' : mainKey;

                if (ctrl === hasCtrl && shift === hasShift && alt === hasAlt && key === targetKey) {
                    e.preventDefault();
                    cmd.action();
                    return;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [togglePalette, commands]);

    const value = React.useMemo(() => ({
        isOpen,
        openPalette,
        closePalette,
        togglePalette,
        registerCommand,
        unregisterCommand,
        commands
    }), [isOpen, commands, openPalette, closePalette, togglePalette, registerCommand, unregisterCommand]);

    return (
        <CommandContext.Provider value={value}>
            {children}
        </CommandContext.Provider>
    );
};
