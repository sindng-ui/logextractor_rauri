/**
 * Helper to generate consistent colors from strings
 */
export const stringToColor = (str: string): string => {
    // 1. Better Hashing (Shift-Add-Xor hash)
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
        hash = hash & hash; // Convert to 32bit integer
    }

    // 2. Use Golden Ratio to spread Hue more evenly
    // 0.618033988749895 is the conjugate of the golden ratio
    const goldenRatioConjugate = 0.618033988749895;
    let h = (Math.abs(hash) * goldenRatioConjugate * 360) % 360;

    // 3. Dynamic Saturation and Lightness for variety
    // Use hash to slightly vary Saturation (65-95%) and Lightness (45-65%)
    const s = 65 + (Math.abs(hash >> 8) % 30);
    const l = 45 + (Math.abs(hash >> 16) % 20);

    // HSL to RGB conversion
    const c = (1 - Math.abs(2 * l / 100 - 1)) * (s / 100);
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l / 100 - c / 2;
    let r_ = 0, g_ = 0, b_ = 0;

    if (0 <= h && h < 60) { r_ = c; g_ = x; b_ = 0; }
    else if (60 <= h && h < 120) { r_ = x; g_ = c; b_ = 0; }
    else if (120 <= h && h < 180) { r_ = 0; g_ = c; b_ = x; }
    else if (180 <= h && h < 240) { r_ = 0; g_ = x; b_ = c; }
    else if (240 <= h && h < 300) { r_ = x; g_ = 0; b_ = c; }
    else if (300 <= h && h < 360) { r_ = c; g_ = 0; b_ = x; }

    const r = Math.round((r_ + m) * 255).toString(16).padStart(2, '0');
    const g = Math.round((g_ + m) * 255).toString(16).padStart(2, '0');
    const b = Math.round((b_ + m) * 255).toString(16).padStart(2, '0');

    return `#${r}${g}${b}`;
};
