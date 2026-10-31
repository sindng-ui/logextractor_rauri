import { useState, useCallback, useEffect, useRef } from 'react';
import { useLogArchiveContext, SelectedText } from '../LogArchiveProvider';

/**
 * 텍스트 선택 정보
 */
interface SelectionInfo {
    text: string;
    x: number;
    y: number;
}

/**
 * LogExtractor에서 텍스트 선택을 감지하고 아카이브 기능과 연동하는 Hook
 * 
 * @param containerRef - 로그 뷰어 컨테이너 ref
 * @param sourceFile - 현재 로그 파일 경로
 * 
 * @returns {object} 선택 정보 및 핸들러
 */
export function useLogSelection(
    containerRef: React.RefObject<HTMLElement>,
    sourceFile?: string
) {
    const { openSaveDialog } = useLogArchiveContext();
    const [selection, setSelection] = useState<SelectionInfo | null>(null);
    const selectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    /**
     * 텍스트 선택 이벤트 핸들러
     */
    const handleSelectionChange = useCallback(() => {
        // 기존 타임아웃 취소
        if (selectionTimeoutRef.current) {
            clearTimeout(selectionTimeoutRef.current);
        }

        // 약간의 딜레이를 두고 선택 확인 (드래그 중 불필요한 호출 방지)
        selectionTimeoutRef.current = setTimeout(() => {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
                setSelection(null);
                return;
            }

            const selectedText = sel.toString().trim();
            if (!selectedText || selectedText.length === 0) {
                setSelection(null);
                return;
            }

            // 컨테이너 체크 로직 생략 (어디서든 선택되면 일단 버튼 표시)
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            // 좌표가 유효하지 않으면 무시
            if (rect.width === 0 && rect.height === 0) return;

            const x = rect.right + 10;
            const y = rect.top;

            console.log('[useLogSelection] SET SELECTION:', { text: selectedText.substring(0, 20), x, y });

            setSelection({
                text: selectedText,
                x,
                y,
            });
        }, 300); // 300ms 딜레이
    }, []); // 의존성 제거하여 항상 최신 상태 유지 필요 없음 (closure 문제 없음)

    /**
     * 저장 버튼 클릭 핸들러
     */
    const handleSave = useCallback(() => {
        if (!selection) return;

        // 선택된 라인 번호 추출 (선택 사항)
        // 구현 시 LogViewer의 구조에 따라 달라질 수 있음
        let startLine: number | undefined;
        let endLine: number | undefined;

        const selectedText: SelectedText = {
            content: selection.text,
            sourceFile,
            startLine,
            endLine,
        };

        openSaveDialog(selectedText);
        setSelection(null); // 선택 초기화
    }, [selection, sourceFile, openSaveDialog]);

    /**
     * 키보드 단축키 (Ctrl+S로 저장)
     */
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's' && selection) {
                e.preventDefault();
                handleSave();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selection, handleSave]);

    /**
     * Selection change 이벤트 리스너 등록
     */
    /**
     * Selection change 이벤트 리스너 등록
     */
    useEffect(() => {
        document.addEventListener('selectionchange', handleSelectionChange);
        document.addEventListener('mouseup', handleSelectionChange); // 추가
        document.addEventListener('keyup', handleSelectionChange);   // 추가

        return () => {
            document.removeEventListener('selectionchange', handleSelectionChange);
            document.removeEventListener('mouseup', handleSelectionChange);
            document.removeEventListener('keyup', handleSelectionChange);
            if (selectionTimeoutRef.current) {
                clearTimeout(selectionTimeoutRef.current);
            }
        };
    }, [handleSelectionChange]);

    /**
     * 선택 해제 (외부 클릭 시)
     */
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (selection && containerRef.current) {
                const target = e.target as Node;
                if (!containerRef.current.contains(target)) {
                    setSelection(null);
                }
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selection, containerRef]);

    return {
        selection,
        handleSave,
        clearSelection: () => setSelection(null),
    };
}
