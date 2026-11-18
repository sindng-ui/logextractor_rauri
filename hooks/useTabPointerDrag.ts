import React, { useState, useRef, useCallback, useEffect } from 'react';

interface DragState {
    tabId: string;
    startX: number;
    startY: number;
    active: boolean;
}

const DRAG_THRESHOLD_PX = 6;

/**
 * Pointer-based horizontal tab reordering compatible with Tauri `dragDropEnabled: true`
 * (where WebView2 intercepts HTML5 `draggable` elements before DOM drag events fire).
 */
export function useTabPointerDrag<T extends { id: string }>(
    setTabs: React.Dispatch<React.SetStateAction<T[]>>
) {
    const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
    const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
    const [dragOverPosition, setDragOverPosition] = useState<'left' | 'right'>('right');

    const stateRef = useRef<DragState | null>(null);
    const overTabIdRef = useRef<string | null>(null);
    const overPosRef = useRef<'left' | 'right'>('right');
    const suppressNextClickRef = useRef<boolean>(false);

    const resetDragState = useCallback(() => {
        stateRef.current = null;
        overTabIdRef.current = null;
        setDraggedTabId(null);
        setDragOverTabId(null);
        setDragOverPosition('right');
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
                setDraggedTabId(st.tabId);
            }

            const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
            const targetTab = el?.closest('[data-tab-id]') as HTMLElement | null;
            const targetId = targetTab?.getAttribute('data-tab-id');

            if (!targetTab || !targetId || targetId === st.tabId) {
                if (overTabIdRef.current !== null) {
                    overTabIdRef.current = null;
                    setDragOverTabId(null);
                }
                return;
            }

            const rect = targetTab.getBoundingClientRect();
            const pos: 'left' | 'right' = e.clientX < rect.left + rect.width / 2 ? 'left' : 'right';

            if (overTabIdRef.current !== targetId) {
                overTabIdRef.current = targetId;
                setDragOverTabId(targetId);
            }
            if (overPosRef.current !== pos) {
                overPosRef.current = pos;
                setDragOverPosition(pos);
            }
        };

        const handlePointerUp = () => {
            const st = stateRef.current;
            if (!st) return;

            const wasActive = st.active;
            const sourceId = st.tabId;
            const targetId = overTabIdRef.current;
            const dropPos = overPosRef.current;

            resetDragState();

            if (!wasActive) return;

            suppressNextClickRef.current = true;
            setTimeout(() => {
                suppressNextClickRef.current = false;
            }, 50);

            if (!targetId || sourceId === targetId) return;

            setTabs((prev) => {
                const draggedIdx = prev.findIndex((t) => t.id === sourceId);
                const targetIdx = prev.findIndex((t) => t.id === targetId);
                if (draggedIdx === -1 || targetIdx === -1) return prev;

                const next = [...prev];
                const [moved] = next.splice(draggedIdx, 1);

                let insertIdx = dropPos === 'right' ? targetIdx + 1 : targetIdx;
                if (draggedIdx < targetIdx) {
                    insertIdx--;
                }

                next.splice(insertIdx, 0, moved);
                return next;
            });
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', resetDragState);
        window.addEventListener('blur', resetDragState);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', resetDragState);
            window.removeEventListener('blur', resetDragState);
        };
    }, [resetDragState, setTabs]);

    const handleTabPointerDown = useCallback((e: React.PointerEvent, tabId: string) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement | null;
        if (target?.closest('[data-tab-close="true"]')) return;

        stateRef.current = {
            tabId,
            startX: e.clientX,
            startY: e.clientY,
            active: false,
        };
    }, []);

    const handleTabClickCapture = useCallback((e: React.MouseEvent) => {
        if (suppressNextClickRef.current) {
            e.stopPropagation();
            e.preventDefault();
            suppressNextClickRef.current = false;
        }
    }, []);

    return {
        draggedTabId,
        dragOverTabId,
        dragOverPosition,
        handleTabPointerDown,
        handleTabClickCapture,
    };
}
