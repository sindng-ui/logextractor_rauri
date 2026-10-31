import { useCallback } from 'react';

interface UseLogSelectionProps {
    setActiveLineIndexLeft: (idx: number) => void;
    setActiveLineIndexRight: (idx: number) => void;
    setSelectedIndicesLeft: (indices: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
    setSelectedIndicesRight: (indices: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
    activeLineIndexLeftRef: React.MutableRefObject<number>;
    activeLineIndexRightRef: React.MutableRefObject<number>;
    selectionSnapshotLeftRef: React.MutableRefObject<Set<number>>;
    selectionSnapshotRightRef: React.MutableRefObject<Set<number>>;
}

/**
 * 펭펭! 로그 뷰어에서 라인 선택(클릭, Shift+클릭, Ctrl+클릭) 로직을 관리하는 훅입니다. 🐧🛠️
 */
export function useLogSelection({
    setActiveLineIndexLeft,
    setActiveLineIndexRight,
    setSelectedIndicesLeft,
    setSelectedIndicesRight,
    activeLineIndexLeftRef,
    activeLineIndexRightRef,
    selectionSnapshotLeftRef,
    selectionSnapshotRightRef
}: UseLogSelectionProps) {

    /**
     * 라인 클릭 시 선택 상태를 업데이트합니다. 🐧✨
     */
    const handleLineClick = useCallback((pane: 'left' | 'right', index: number, isShift: boolean, isCtrl: boolean) => {
        const setActive = pane === 'left' ? setActiveLineIndexLeft : setActiveLineIndexRight;
        const setSelection = pane === 'left' ? setSelectedIndicesLeft : setSelectedIndicesRight;

        const anchorRef = pane === 'left' ? activeLineIndexLeftRef : activeLineIndexRightRef;
        const currentActive = anchorRef.current;
        const snapshotRef = pane === 'left' ? selectionSnapshotLeftRef : selectionSnapshotRightRef;

        // ✅ 선택 해제 처리
        if (index === -1) {
            setSelection(new Set());
            snapshotRef.current = new Set();
            anchorRef.current = -1;
            setActive(-1);
            return;
        }

        if (isShift && currentActive !== -1) {
            // 범위 선택 (드래그 또는 Shift+클릭) 🐧🔗
            const start = Math.min(currentActive, index);
            const end = Math.max(currentActive, index);
            const range = new Set<number>();
            for (let i = start; i <= end; i++) range.add(i);

            // Shift+클릭 시 앵커(anchor)는 이동시키지 않는 것이 표준 동작입니다.
            if (isCtrl) {
                // Ctrl + Shift/드래그 (기존 스냅샷에 합치기)
                setSelection(() => {
                    const next = new Set(snapshotRef.current);
                    range.forEach(idx => next.add(idx));
                    return next;
                });
            } else {
                // 일반 Shift/드래그 (선택 범위 교체)
                setSelection(range);
            }
        } else if (isCtrl) {
            // 개별 토글 선택 🐧🔘
            setSelection(prev => {
                const next = new Set(prev);
                if (next.has(index)) next.delete(index);
                else next.add(index);
                // 토글 후 스냅샷 업데이트
                snapshotRef.current = new Set(next);
                return next;
            });
            // 앵커 업데이트
            anchorRef.current = index;
            setActive(index);
        } else {
            // 단일 선택 (앵커 초기화) 🐧📍
            const next = new Set([index]);
            setSelection(next);
            snapshotRef.current = next; // 스냅샷 업데이트
            anchorRef.current = index;
            setActive(index);
        }
    }, [
        setActiveLineIndexLeft,
        setActiveLineIndexRight,
        setSelectedIndicesLeft,
        setSelectedIndicesRight,
        activeLineIndexLeftRef,
        activeLineIndexRightRef,
        selectionSnapshotLeftRef,
        selectionSnapshotRightRef
    ]);

    return { handleLineClick };
}
