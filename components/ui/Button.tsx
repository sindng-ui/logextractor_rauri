import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
    size?: 'xs' | 'sm' | 'md' | 'lg';
    icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
    variant = 'primary',
    size = 'md',
    icon,
    children,
    className = '',
    ...props
}) => {
    const baseStyle = "flex items-center justify-center font-medium transition-all rounded-lg focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed active:scale-95";

    const variants = {
        primary: "bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-900/50 hover:shadow-indigo-500/30 hover:scale-[1.02]",
        secondary: "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700 shadow-sm",
        danger: "bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/20 shadow-sm",
        ghost: "bg-transparent text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10",
        outline: "border-2 border-dashed border-slate-700 text-slate-500 hover:bg-slate-800 hover:border-slate-600 hover:text-indigo-400"
    };

    const sizes = {
        xs: "px-2 py-0.5 text-[10px] gap-1",
        sm: "px-3 py-1.5 text-xs gap-1.5",
        md: "px-4 py-2 text-sm gap-2",
        lg: "px-6 py-3 text-base gap-2"
    };

    return (
        <button
            className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`}
            {...props}
        >
            {icon && <span className="shrink-0">{icon}</span>}
            {children}
        </button>
    );
};
