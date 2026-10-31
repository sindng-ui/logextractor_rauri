import React, { useState, useEffect } from 'react';

interface ConfigHeaderProps {
    name: string;
    onUpdateName: (name: string) => void;
}

export const ConfigHeader = React.memo<ConfigHeaderProps>(({ name, onUpdateName }) => {
    const [localName, setLocalName] = useState(name);

    useEffect(() => {
        setLocalName(name);
    }, [name]);

    const handleBlur = () => {
        if (localName !== name) {
            onUpdateName(localName);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur();
        }
    };

    return (
        <div className="mb-4 relative group">
            <div className="flex justify-between items-end mb-1.5">
                <label className="block text-[11px] font-bold text-indigo-400 uppercase tracking-widest pl-1">Mission Name</label>
            </div>
            <div className="relative">
                <input
                    className="w-full bg-slate-900/40 text-glow rounded-xl px-4 py-3 text-xl font-black text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 border border-transparent focus:border-indigo-500/30 placeholder-slate-600 transition-all shadow-inner"
                    value={localName}
                    onChange={(e) => setLocalName(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    placeholder="Untitled Rule"
                />
                <div className="absolute inset-0 rounded-xl pointer-events-none border border-white/5 bg-gradient-to-br from-white/5 to-transparent"></div>
            </div>
        </div>
    );
});
