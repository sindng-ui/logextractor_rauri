import React from 'react';

export interface PluginContext {
    uniqueId: string;
}

export interface HappyPlugin {
    id: string;
    name: string;
    icon: React.ComponentType<{ className?: string; size?: number }>;
    component: React.ComponentType<any>;
    order?: number;
    isLab?: boolean;
    onInit?: (context: PluginContext) => void;
}
