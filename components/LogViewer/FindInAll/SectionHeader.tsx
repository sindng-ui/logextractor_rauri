import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface SectionHeaderProps {
    isOpen: boolean;
    onToggle: () => void;
    icon: React.ReactNode;
    title: string;
    badge?: React.ReactNode;
    accentColor?: 'default' | 'emerald' | 'rose';
}

const SectionHeader: React.FC<SectionHeaderProps> = ({
    isOpen, onToggle, icon, title, badge, accentColor = 'default'
}) => {
    const accentMap = {
        default: 'text-slate-400 hover:text-slate-200',
        emerald: 'text-indigo-400/80 hover:text-indigo-300',
        rose: 'text-rose-400/80 hover:text-rose-300',
    };
    
    return (
        <button
            onClick={onToggle}
            className={`w-full flex items-center gap-2 px-5 py-3 text-xs font-bold hover:bg-white/[0.03] transition-colors ${accentMap[accentColor]}`}
        >
            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            {icon}
            <span>{title}</span>
            {badge}
        </button>
    );
};

export default SectionHeader;
