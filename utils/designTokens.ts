// Design Tokens for HappyTool
// 성능에 영향 없는 CSS 변수 기반 디자인 시스템

export const colors = {
    // Background
    bg: {
        primary: '#0f172a',    // slate-950
        secondary: '#1e293b',  // slate-900
        tertiary: '#334155',   // slate-800
        hover: '#475569',      // slate-700
    },

    // Accent
    accent: {
        primary: '#6366f1',    // indigo-500
        hover: '#818cf8',      // indigo-400
        active: '#4f46e5',     // indigo-600
        subtle: 'rgba(99, 102, 241, 0.1)',
    },

    // Text
    text: {
        primary: '#f1f5f9',    // slate-100
        secondary: '#cbd5e1',  // slate-300
        muted: '#94a3b8',      // slate-400
        disabled: '#64748b',   // slate-500
    },

    // Border
    border: {
        default: 'rgba(99, 102, 241, 0.3)',
        subtle: 'rgba(255, 255, 255, 0.1)',
        strong: 'rgba(99, 102, 241, 0.5)',
    },

    // Status
    status: {
        success: '#10b981',    // emerald-500
        warning: '#f59e0b',    // amber-500
        error: '#ef4444',      // red-500
        info: '#3b82f6',       // blue-500
    }
} as const;

export const spacing = {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    '2xl': '32px',
} as const;

export const animations = {
    // ✅ GPU-accelerated transitions (성능 최적화)
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    normal: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',

    // Easing functions
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

export const layout = {
    titleBarHeight: '40px',      // h-10 통일
    sidebarWidth: '240px',
    borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
    },
    shadow: {
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        glow: '0 0 20px rgba(99, 102, 241, 0.3)',
    },
} as const;

// Tailwind CSS classes (재사용 가능)
export const commonClasses = {
    titleBar: 'h-10 flex items-center bg-slate-950 border-b border-indigo-500/30 px-3 select-none',
    button: {
        primary: 'px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all duration-200',
        secondary: 'px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-all duration-200',
        ghost: 'px-2 py-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-all duration-200',
    },
    tab: {
        base: 'group relative flex items-center gap-2 px-4 py-1.5 min-w-[120px] max-w-[200px] h-[36px] text-xs font-medium cursor-pointer transition-all duration-200 rounded-t-lg border-t border-l border-r',
        active: 'bg-slate-900 border-indigo-500/50 text-indigo-300 z-20 shadow-lg shadow-indigo-500/10',
        inactive: 'bg-slate-950 border-slate-800 text-slate-500 hover:bg-slate-900 hover:text-slate-300 z-10',
    },
} as const;
