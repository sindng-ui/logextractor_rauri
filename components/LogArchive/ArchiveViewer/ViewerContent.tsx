import React, { useMemo } from 'react';

interface LogLineProps {
    line: string;
    lineIndex: number;
    matches: Array<{ index: number, length: number, lineIndex: number }>;
    currentMatchIdx: number;
    totalMatchOffset: number;
}

const LogLine = React.memo(({ line, lineIndex, matches, currentMatchIdx, totalMatchOffset }: LogLineProps) => {
    if (matches.length === 0) return <div className="log-line">{line}</div>;

    const elements: React.ReactNode[] = [];
    let lastIndex = 0;

    matches.forEach((match, i) => {
        const globalMatchIdx = totalMatchOffset + i;
        const isCurrent = globalMatchIdx === currentMatchIdx;

        if (match.index > lastIndex) {
            elements.push(line.substring(lastIndex, match.index));
        }

        elements.push(
            <mark
                key={`m-${globalMatchIdx}`}
                id={`search-match-${globalMatchIdx}`}
                className={`search-highlight ${isCurrent ? 'current' : ''}`}
            >
                {line.substring(match.index, match.index + match.length)}
            </mark>
        );
        lastIndex = match.index + match.length;
    });

    if (lastIndex < line.length) {
        elements.push(line.substring(lastIndex));
    }

    return (
        <div className="log-line" data-line={lineIndex}>
            {elements}
        </div>
    );
});

interface ViewerContentProps {
    content: string;
    submittedTerm: string;
    matches: Array<{ index: number, length: number }>;
    currentMatchIdx: number;
}

export const ViewerContent = React.memo(({
    content,
    submittedTerm,
    matches,
    currentMatchIdx
}: ViewerContentProps) => {
    const lines = useMemo(() => content.split('\n'), [content]);

    // Pre-calculate which matches belong to which lines
    const lineMatches = useMemo(() => {
        if (!submittedTerm || matches.length === 0) return [];

        const results: Array<Array<{ index: number, length: number, lineIndex: number }>> = Array(lines.length).fill(null).map(() => []);

        let currentPos = 0;
        let matchPtr = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineEnd = currentPos + line.length;

            while (matchPtr < matches.length && matches[matchPtr].index >= currentPos && matches[matchPtr].index < lineEnd) {
                results[i].push({
                    ...matches[matchPtr],
                    index: matches[matchPtr].index - currentPos,
                    lineIndex: i
                });
                matchPtr++;
            }

            // +1 for the \n that was split
            currentPos = lineEnd + 1;
        }
        return results;
    }, [lines, matches, submittedTerm]);

    // Helper to get total match offset for a line
    const getMatchOffset = (lineIdx: number) => {
        let offset = 0;
        for (let i = 0; i < lineIdx; i++) {
            offset += lineMatches[i]?.length || 0;
        }
        return offset;
    };

    return (
        <div className="viewer-content">
            <div className="viewer-code-wrapper">
                <pre className="viewer-code">
                    {lines.map((line, idx) => (
                        <LogLine
                            key={`l-${idx}`}
                            line={line}
                            lineIndex={idx}
                            matches={lineMatches[idx] || []}
                            currentMatchIdx={currentMatchIdx}
                            totalMatchOffset={getMatchOffset(idx)}
                        />
                    ))}
                </pre>
            </div>
        </div>
    );
});
