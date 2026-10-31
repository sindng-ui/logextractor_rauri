import React, {
    useState, useEffect, useCallback, useRef, memo, KeyboardEvent
} from 'react';
import { X } from 'lucide-react';

interface TagInputProps {
    tags: string[];
    onChange: (tags: string[]) => void;
    placeholder?: string;
    accentColor?: 'emerald' | 'rose';
    autoFocus?: boolean;
}

// ── Happy Combo chip: matches HappyComboSection root tag style exactly
const TAG_COLORS_EMERALD = 'bg-indigo-900/50 border-indigo-500/50 text-indigo-100 hover:border-indigo-400/70 hover:bg-indigo-900/70';
// ── Block List chip: rose variant, same light weight feel
const TAG_COLORS_ROSE    = 'bg-rose-950/60 border-rose-700/50 text-rose-100 hover:border-rose-500/70 hover:bg-rose-950/80';

const TagInput: React.FC<TagInputProps> = memo(({ tags, onChange, placeholder, accentColor = 'emerald', autoFocus }) => {
    const [inputVal, setInputVal] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const tagColorClass  = accentColor === 'emerald' ? TAG_COLORS_EMERALD : TAG_COLORS_ROSE;
    const focusRingClass = accentColor === 'emerald'
        ? 'focus-within:border-indigo-500/50 focus-within:shadow-[0_0_0_2px_rgba(99,102,241,0.10)]'
        : 'focus-within:border-rose-500/50 focus-within:shadow-[0_0_0_2px_rgba(244,63,94,0.10)]';

    const addTag = useCallback((raw: string) => {
        const words = raw.split(/[,\n]+/).map(w => w.trim()).filter(w => w.length > 0);
        if (words.length === 0) return;
        const unique = Array.from(new Set([...tags, ...words]));
        if (unique.length !== tags.length) onChange(unique);
    }, [tags, onChange]);

    const removeTag = useCallback((idx: number) => {
        onChange(tags.filter((_, i) => i !== idx));
    }, [tags, onChange]);

    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addTag(inputVal);
            setInputVal('');
        } else if (e.key === 'Backspace' && inputVal === '' && tags.length > 0) {
            onChange(tags.slice(0, -1));
        }
    }, [inputVal, addTag, onChange, tags]);

    const handleBlur = useCallback(() => {
        if (inputVal.trim()) {
            addTag(inputVal);
            setInputVal('');
        }
    }, [inputVal, addTag]);

    const handleBoxClick = useCallback(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        if (autoFocus) {
            setTimeout(() => inputRef.current?.focus(), 60);
        }
    }, [autoFocus]);

    return (
        <div
            ref={containerRef}
            onClick={handleBoxClick}
            className={`
                min-h-[56px] w-full rounded-xl border border-slate-700/50 bg-slate-950/50
                p-2 flex flex-wrap gap-1.5 items-start cursor-text
                transition-all duration-200 ${focusRingClass}
            `}
        >
            {tags.map((tag, i) => (
                <span
                    key={`${tag}-${i}`}
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border text-xs font-mono font-semibold transition-all duration-150 select-none ${tagColorClass}`}
                >
                    {tag}
                    <button
                        type="button"
                        onMouseDown={e => { e.preventDefault(); removeTag(i); }}
                        className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity rounded"
                        tabIndex={-1}
                    >
                        <X size={10} />
                    </button>
                </span>
            ))}
            <input
                ref={inputRef}
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                placeholder={tags.length === 0 ? placeholder : ''}
                className="flex-1 min-w-[120px] bg-transparent text-xs text-slate-200 placeholder-slate-600 font-mono focus:outline-none py-0.5"
                spellCheck={false}
            />
        </div>
    );
});

TagInput.displayName = 'TagInput';

export default TagInput;
