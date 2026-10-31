import { useState } from 'react';

export function useLogBookmarkState() {
    const [leftBookmarks, setLeftBookmarks] = useState<Set<number>>(new Set());
    const [rightBookmarks, setRightBookmarks] = useState<Set<number>>(new Set());

    return {
        leftBookmarks, setLeftBookmarks,
        rightBookmarks, setRightBookmarks
    };
}
