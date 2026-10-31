import React from 'react';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    icon: React.ReactNode;
    tooltip?: string;
    variant?: 'ghost' | 'danger' | 'default' | 'delete';
    size?: 'xs' | 'sm' | 'md' | 'lg';
}

export const IconButton: React.FC<IconButtonProps> = ({
    icon,
    tooltip,
    variant = 'ghost',
    size = 'sm',
    className = '',
    ...props
}) => {
    const baseStyle = "rounded-full transition-all flex items-center justify-center disabled:opacity-50 active:scale-90";

    const variants = {
        default: "bg-slate-800 text-slate-400 hover:text-white border border-slate-700 shadow-md hover:scale-110 hover:shadow-lg hover:shadow-indigo-500/20",
        ghost: "text-slate-500 hover:text-indigo-400 hover:bg-slate-700/50",
        danger: "text-slate-500 hover:text-red-400 hover:bg-red-500/10",
        delete: "bg-slate-700 text-slate-400 hover:text-white hover:bg-red-500 border border-slate-600 shadow-sm"
    };

    const sizes = {
        xs: "p-0.5",
        sm: "p-1",
        md: "p-2 w-8 h-8",
        lg: "p-2 w-10 h-10"
    };

    return (
        <button
            className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`}
            title={tooltip}
            {...props}
        >
            {icon}
        </button>
    );
};
