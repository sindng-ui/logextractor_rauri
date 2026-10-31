import { useState } from 'react';

export function useLogSelectionState() {
    const [selectedIndicesLeft, setSelectedIndicesLeft] = useState<Set<number>>(new Set());
    const [selectedIndicesRight, setSelectedIndicesRight] = useState<Set<number>>(new Set());
    const [activeLineIndexLeft, setActiveLineIndexLeft] = useState<number>(-1);
    const [activeLineIndexRight, setActiveLineIndexRight] = useState<number>(-1);

    const [leftLineHighlightRanges, setLeftLineHighlightRanges] = useState<{ start: number; end: number; color: string }[]>([]);
    const [rightLineHighlightRanges, setRightLineHighlightRanges] = useState<{ start: number; end: number; color: string }[]>([]);
    const [rawViewHighlightRange, setRawViewHighlightRange] = useState<{ start: number; end: number } | null>(null);

    return {
        selectedIndicesLeft, setSelectedIndicesLeft,
        selectedIndicesRight, setSelectedIndicesRight,
        activeLineIndexLeft, setActiveLineIndexLeft,
        activeLineIndexRight, setActiveLineIndexRight,
        leftLineHighlightRanges, setLeftLineHighlightRanges,
        rightLineHighlightRanges, setRightLineHighlightRanges,
        rawViewHighlightRange, setRawViewHighlightRange
    };
}
