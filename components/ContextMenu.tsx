import React, { useState, useEffect, useRef } from 'react';
import * as Lucide from 'lucide-react';

const { Copy, XCircle, X, Trash2 } = Lucide;

interface ContextMenuItem {
    type?: 'item' | 'separator';
    label?: string;
    icon?: React.ReactNode;
    action?: () => void;
    variant?: 'default' | 'danger';
    disabled?: boolean;
}

interface ContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
    const menuRef = useRef<HTMLDivElement>(null);

    // 외부 클릭 시 메뉴 닫기
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        // capture: true — 로그 뷰어의 stopPropagation에도 불구하고 감지 가능
        // setTimeout 제거: 즉시 등록해야 드래그 후 첫 클릭에서 바로 닫힘
        document.addEventListener('mousedown', handleClickOutside, { capture: true });
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside, { capture: true });
            document.removeEventListener('keydown', handleEscape);
        };
    }, [onClose]);

    // Adjust position if menu would overflow
    const [adjustedPosition, setAdjustedPosition] = useState({ x, y });

    useEffect(() => {
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            let newX = x;
            let newY = y;

            if (x + rect.width > viewportWidth) {
                newX = viewportWidth - rect.width - 10;
            }

            if (y + rect.height > viewportHeight) {
                newY = viewportHeight - rect.height - 10;
            }

            setAdjustedPosition({ x: newX, y: newY });
        }
    }, [x, y]);

    return (
        <div
            ref={menuRef}
            className="fixed z-[9999] bg-[#0f172a]/95  border border-white/10 rounded-xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)] min-w-[220px] p-1.5 animate-in fade-in zoom-in-95 duration-200 ring-1 ring-white/5"
            style={{
                left: `${adjustedPosition.x}px`,
                top: `${adjustedPosition.y}px`,
            }}
        >
            {items.map((item, idx) => {
                if (item.type === 'separator') {
                    return <div key={idx} className="h-px bg-white/10 my-1 mx-2" />;
                }

                return (
                    <button
                        key={idx}
                        onClick={() => {
                            if (!item.disabled && item.action) {
                                item.action();
                                onClose();
                            }
                        }}
                        disabled={item.disabled}
                        className={`
                            w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 group
                            ${item.disabled
                                ? 'opacity-40 cursor-not-allowed'
                                : item.variant === 'danger'
                                    ? 'hover:bg-red-500/10 text-red-400 hover:text-red-300'
                                    : 'text-slate-300 hover:bg-gradient-to-r hover:from-indigo-600 hover:to-blue-600 hover:text-white hover:shadow-lg hover:shadow-indigo-500/30 active:scale-[0.98]'
                            }
                        `}
                    >
                        <span className="w-4 h-4 flex items-center justify-center opacity-70 group-hover:opacity-100">
                            {item.icon}
                        </span>
                        <span className="flex-1 text-left">{item.label}</span>
                    </button>
                );
            })}
        </div>
    );
};

// ✅ Hook for managing context menu state
export const useContextMenu = () => {
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        items: ContextMenuItem[];
    } | null>(null);

    const showContextMenu = (e: React.MouseEvent, items: ContextMenuItem[]) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            items,
        });
    };

    const hideContextMenu = () => {
        setContextMenu(null);
    };

    const ContextMenuComponent = contextMenu ? (
        <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenu.items}
            onClose={hideContextMenu}
        />
    ) : null;

    return {
        showContextMenu,
        hideContextMenu,
        ContextMenuComponent,
    };
};
