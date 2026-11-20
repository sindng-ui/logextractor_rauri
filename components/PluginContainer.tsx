import React from 'react';
import { HappyPlugin } from '../plugins/types';

interface PluginContainerProps {
    plugin: HappyPlugin;
    isActive: boolean;
    onLoaded?: () => void;
    extraProps?: Record<string, any>;
}

// Helper to notify when Suspense is done
const LoadNotifier: React.FC<{ onLoaded?: () => void }> = ({ onLoaded }) => {
    React.useEffect(() => {
        onLoaded?.();
    }, [onLoaded]);
    return null;
};

const PluginContainer: React.FC<PluginContainerProps> = ({ plugin, isActive, onLoaded, extraProps }) => {
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
            <div className={isActive ? "h-full w-full bg-[#070b14]" : "hidden"} />
        }>
            <div className={isActive ? "h-full w-full" : "hidden"}>
                <Component isActive={isActive} {...extraProps} />
                <LoadNotifier onLoaded={onLoaded} />
            </div>
        </React.Suspense>
    );
};

export default React.memo(PluginContainer);
