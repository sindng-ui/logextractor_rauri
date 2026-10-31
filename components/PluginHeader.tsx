import React from 'react';
import * as Lucide from 'lucide-react';

interface PluginHeaderProps {
  title: string;
  icon: keyof typeof Lucide | React.ComponentType<any>;
  actions?: React.ReactNode;
  className?: string;
}

const PluginHeader: React.FC<PluginHeaderProps> = ({ 
  title, 
  icon: IconProp, 
  actions, 
  className = "" 
}) => {
  // Resolve icon component
  const Icon = typeof IconProp === 'string' 
    ? (Lucide as any)[IconProp] || Lucide.Package 
    : IconProp;

  return (
    <div className={`h-16 pl-16 pr-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md z-20 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-500">
          <Icon size={20} strokeWidth={2.5} />
        </div>
        <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 tracking-tight uppercase">
          {title}
        </h2>
      </div>
      <div className="flex items-center gap-2">
        {actions}
      </div>
    </div>
  );
};

export default PluginHeader;
