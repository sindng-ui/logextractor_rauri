// --- Helper: Merge Sorted Arrays (Unique) ---
export const mergeSortedUnique = (a: Int32Array, b: number[]): Int32Array => {
    if (b.length === 0) return a;
    if (a.length === 0) return new Int32Array(b);

    const result = new Int32Array(a.length + b.length);
    let i = 0, j = 0, k = 0;

    while (i < a.length && j < b.length) {
        if (a[i] < b[j]) {
            result[k++] = a[i++];
        } else if (a[i] > b[j]) {
            result[k++] = b[j++];
        } else {
            // Duplicate
            result[k++] = a[i++];
            j++;
        }
    }
    while (i < a.length) result[k++] = a[i++];
    while (j < b.length) result[k++] = b[j++];

    return result.subarray(0, k);
};
