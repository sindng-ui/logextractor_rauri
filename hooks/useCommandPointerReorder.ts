import React, { useState, useRef, useCallback, useEffect } from 'react';

interface CommandDragState {
    id: string;
    startX: number;
    startY: number;
    active: boolean;
}

const DRAG_THRESHOLD_PX = 6;
const SWAP_COOLDOWN_MS = 150;

/**
 * Pointer-based Quick Command card reordering compatible with Tauri `dragDropEnabled: true`.
 */
export function useCommandPointerReorder<T extends { id: string }>(
    setCommands: React.Dispatch<React.SetStateAction<T[]>>,
    searchQuery: string
) {
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const stateRef = useRef<CommandDragState | null>(null);
    const searchQueryRef = useRef(searchQuery);
    searchQueryRef.current = searchQuery;

    const lastSwapTimeRef = useRef<number>(0);
    const suppressNextClickRef = useRef<boolean>(false);

    const clearState = useCallback(() => {
        stateRef.current = null;
        setDraggedId(null);
    }, []);

    useEffect(() => {
        const handlePointerMove = (e: PointerEvent) => {
            const st = stateRef.current;
            if (!st) return;

            if (!st.active) {
                const dx = e.clientX - st.startX;
                const dy = e.clientY - st.startY;
                if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
                st.active = true;
                setDraggedId(st.id);
            }

            if (searchQueryRef.current.trim() !== '') return;

            const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
            const targetCard = el?.closest('[data-cmd-id]') as HTMLElement | null;
            const targetId = targetCard?.getAttribute('data-cmd-id');
            if (!targetId || targetId === st.id) return;

            const now = Date.now();
            if (now - lastSwapTimeRef.current < SWAP_COOLDOWN_MS) return;
            lastSwapTimeRef.current = now;

            setCommands((prev) => {
                const draggedIdx = prev.findIndex((c) => c.id === st.id);
                const targetIdx = prev.findIndex((c) => c.id === targetId);
                if (draggedIdx === -1 || targetIdx === -1) return prev;

                const next = [...prev];
                const [moved] = next.splice(draggedIdx, 1);
                next.splice(targetIdx, 0, moved);
                return next;
            });
        };

        const handlePointerUp = () => {
            const st = stateRef.current;
            if (!st) return;
            const wasActive = st.active;
            clearState();

            if (wasActive) {
                suppressNextClickRef.current = true;
                setTimeout(() => {
                    suppressNextClickRef.current = false;
                }, 50);
            }
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', clearState);
        window.addEventListener('blur', clearState);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', clearState);
            window.removeEventListener('blur', clearState);
        };
    }, [clearState, setCommands]);

    const handleItemPointerDown = useCallback((id: string, e: React.PointerEvent) => {
        if (e.button !== 0 || searchQueryRef.current.trim() !== '') return;
        const target = e.target as HTMLElement | null;
        if (target?.closest('button, input, textarea, a')) return;

        stateRef.current = { id, startX: e.clientX, startY: e.clientY, active: false };
    }, []);

    const consumeSuppressedClick = useCallback((): boolean => {
        if (!suppressNextClickRef.current) return false;
        suppressNextClickRef.current = false;
        return true;
    }, []);

    return {
        draggedId,
        handleItemPointerDown,
        consumeSuppressedClick,
    };
}
