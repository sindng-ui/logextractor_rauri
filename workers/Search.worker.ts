/// <reference lib="webworker" />

// Helper for finding the line number of a match in a large string
const getLineNumber = (text: string, index: number) => {
    let line = 1;
    for (let i = 0; i < index; i++) {
        if (text[i] === '\n') line++;
    }
    return line;
};

self.onmessage = async (e: MessageEvent) => {
    const { type, payload, requestId } = e.data;

    try {
        if (type === 'SEARCH') {
            const { text, query, useRegex, caseSensitive } = payload;
            const results: { index: number, line: number, length: number }[] = [];

            if (!text || !query) {
                self.postMessage({ type: 'SEARCH_COMPLETE', payload: [], requestId });
                return;
            }

            let regex: RegExp;
            try {
                const flags = caseSensitive ? 'g' : 'gi';
                if (useRegex) {
                    regex = new RegExp(query, flags);
                } else {
                    // Escape special regex chars
                    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    regex = new RegExp(escaped, flags);
                }
            } catch (err) {
                self.postMessage({ type: 'ERROR', error: 'Invalid Regex', requestId });
                return;
            }

            let match;
            // Limit results to prevent crashing on massive number of matches
            const MAX_RESULTS = 10000;

            // Optimization: If text is huge, finding line numbers for every match is slow.
            // We can pre-calculate line start indices if needed, but for now simple approach.
            // A better approach for huge files is to map line starts once.

            // Fast line mapping
            const lineStarts = [0];
            let pos = text.indexOf('\n');
            while (pos > -1) {
                lineStarts.push(pos + 1);
                pos = text.indexOf('\n', pos + 1);
            }

            const findLineBinary = (idx: number) => {
                let low = 0, high = lineStarts.length - 1;
                while (low <= high) {
                    const mid = Math.floor((low + high) / 2);
                    if (lineStarts[mid] <= idx) {
                        low = mid + 1;
                    } else {
                        high = mid - 1;
                    }
                }
                return low; // 1-based line number (index in array + 1, effectively)
            }


            while ((match = regex.exec(text)) !== null) {
                if (results.length >= MAX_RESULTS) break;

                results.push({
                    index: match.index,
                    length: match[0].length,
                    line: findLineBinary(match.index)
                });
            }

            self.postMessage({ type: 'SEARCH_COMPLETE', payload: results, requestId });
        } else if (type === 'SEARCH_JSON') {
            const { text, query, caseSensitive } = payload;

            if (!text || !query) {
                self.postMessage({ type: 'SEARCH_COMPLETE', payload: [], requestId });
                return;
            }

            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                self.postMessage({ type: 'ERROR', error: 'Invalid JSON', requestId });
                return;
            }

            const results: string[] = []; // List of path strings "root.child.key"
            const seen = new Set<string>();
            const q = caseSensitive ? query : query.toLowerCase();

            // DFS Traversal
            const stack: { node: any, path: string[] }[] = [{ node: data, path: [] }];

            // Limit execution time or results to prevent freeze if huge?
            let count = 0;
            const MAX_RESULTS = 20000; // Increased limit

            while (stack.length > 0) {
                const { node, path } = stack.pop()!;

                if (count >= MAX_RESULTS) break;

                const isObj = node !== null && typeof node === 'object';

                if (isObj) {
                    const keys = Object.keys(node);
                    // Push in reverse order to preserve natural order when popping
                    for (let i = keys.length - 1; i >= 0; i--) {
                        const key = keys[i];
                        const val = node[key];

                        // Check Key
                        const keyCheck = caseSensitive ? key : key.toLowerCase();
                        if (keyCheck.includes(q)) {
                            const p = [...path, key].join('.');
                            if (!seen.has(p)) {
                                results.push(p);
                                seen.add(p);
                                count++;
                            }
                        }

                        // Push children to stack
                        stack.push({ node: val, path: [...path, key] });
                    }
                } else {
                    // Primitive Value Check
                    const valStr = String(node);
                    const valCheck = caseSensitive ? valStr : valStr.toLowerCase();
                    if (valCheck.includes(q)) {
                        const p = path.join('.');
                        if (!seen.has(p)) {
                            results.push(p);
                            seen.add(p);
                            count++;
                        }
                    }
                }
            }

            self.postMessage({ type: 'SEARCH_COMPLETE', payload: results, requestId });
        }
    } catch (error: any) {
        self.postMessage({ type: 'ERROR', error: error.message, requestId });
    }
};
