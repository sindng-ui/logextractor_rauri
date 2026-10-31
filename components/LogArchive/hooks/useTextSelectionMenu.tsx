import React, { useCallback } from 'react';
import * as Lucide from 'lucide-react';
import { useLogArchiveContext } from '../LogArchiveProvider';
import { useContextMenu } from '../../ContextMenu';

/**
 * 텍스트 선택 후 우클릭 시 "Save to Archive" 메뉴를 제공하는 훅
 */
export function useTextSelectionMenu() {
    const { openSaveDialog } = useLogArchiveContext();
    const { showContextMenu, ContextMenuComponent, hideContextMenu } = useContextMenu();

    const handleContextMenu = useCallback((e: React.MouseEvent, sourceInfo?: { sourceFile?: string, startLine?: number }) => {
        const selection = window.getSelection();
        const selectedText = selection?.toString();

        // 선택된 텍스트가 있는 경우에만 메뉴 표시
        // 또한, 선택 영역이 현재 컴포넌트(이벤트 타겟) 내에 포함되어 있는지 확인
        if (selectedText && selectedText.trim().length > 0) {
            const range = selection?.getRangeAt(0);
            const container = e.currentTarget as Node;

            // Selection이 현재 컨테이너 내부에 있는지 확인 (Cross-component selection 방지)
            if (range && container.contains(range.commonAncestorContainer)) {
                e.preventDefault();
                e.stopPropagation();

                showContextMenu(e, [
                    {
                        label: 'Save Selection to Archive',
                        icon: <Lucide.Archive size={16} />,
                        action: () => {
                            openSaveDialog({
                                content: selectedText,
                                sourceFile: sourceInfo?.sourceFile,
                                startLine: sourceInfo?.startLine
                            });
                            hideContextMenu();
                        }
                    }
                ]);
            }
        }
    }, [openSaveDialog, showContextMenu, hideContextMenu]);

    return {
        handleContextMenu,
        ContextMenuComponent
    };
}
