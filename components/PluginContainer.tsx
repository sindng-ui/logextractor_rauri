import React from 'react';
import { HappyPlugin } from '../plugins/types';

interface PluginContainerProps {
    plugin: HappyPlugin;
    isActive: boolean;
    onLoaded?: () => void;
}

// Helper to notify when Suspense is done
const LoadNotifier: React.FC<{ onLoaded?: () => void }> = ({ onLoaded }) => {
    React.useEffect(() => {
        onLoaded?.();
    }, [onLoaded]);
    return null;
};

const PluginContainer: React.FC<PluginContainerProps> = ({ plugin, isActive, onLoaded }) => {
    const Component = plugin.component;
    const [hasBeenActive, setHasBeenActive] = React.useState(isActive);

    React.useEffect(() => {
        if (isActive && !hasBeenActive) {
            setHasBeenActive(true);
        }
    }, [isActive, hasBeenActive]);

    if (!isActive && !hasBeenActive) {
        return null;
    }

    return (
        <React.Suspense fallback={
            <div className={isActive ? "h-full w-full flex items-center justify-center text-slate-500" : "hidden"}>
                <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-500"></div>
                    <div>Loading {plugin.name}...</div>
                </div>
            </div>
        }>
            <div className={isActive ? "h-full w-full" : "hidden"}>
                <Component isActive={isActive} />
                <LoadNotifier onLoaded={onLoaded} />
            </div>
        </React.Suspense>
    );
};

export default React.memo(PluginContainer);
