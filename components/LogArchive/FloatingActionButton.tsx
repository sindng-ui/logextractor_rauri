import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Archive } from 'lucide-react';

interface FloatingActionButtonProps {
    /**
     * 선택된 텍스트 정보
     */
    selection: {
        text: string;
        x: number;
        y: number;
    } | null;

    /**
     * 저장 버튼 클릭 핸들러
     */
    onSave: () => void;
}

/**
 * Floating Action Button (텍스트 선택 시 표시)
 * 
 * 로그 선택 시 선택 영역 근처에 나타나는 저장 버튼
 * Portal을 사용하여 document.body에 렌더링하여 overflow 문제 해결
 */
export function FloatingActionButton({ selection, onSave }: FloatingActionButtonProps) {
    const [position, setPosition] = useState({ x: 0, y: 0 });

    useEffect(() => {
        if (selection) {
            // 버튼을 선택 영역 우측 상단에 배치
            // 화면 밖으로 나가지 않도록 최소값/최대값 보정할 수 있음
            console.log('[FloatingButton] Position:', selection.x, selection.y);
            setPosition({
                x: selection.x,
                y: Math.max(10, selection.y - 45), // 화면 위로 넘어가지 않게 보호
            });
        }
    }, [selection]);

    // Portal을 사용하여 body에 직접 렌더링
    return createPortal(
        <AnimatePresence>
            {selection && (
                <motion.button
                    initial={{ opacity: 0, scale: 0.8, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8, y: 10 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    onClick={(e) => {
                        e.stopPropagation(); // 이벤트 버블링 방지
                        onSave();
                    }}
                    style={{
                        position: 'fixed',
                        left: `${position.x}px`,
                        top: `${position.y}px`,
                        zIndex: 99999, // 매우 높은 z-index
                        pointerEvents: 'auto',
                    }}
                    className="floating-action-button"
                    title="Save to Archive (Ctrl+S)"
                    aria-label="Save selected text to archive"
                >
                    <Archive size={18} />
                    <span>Save</span>
                </motion.button>
            )}
        </AnimatePresence>,
        document.body
    );
}
