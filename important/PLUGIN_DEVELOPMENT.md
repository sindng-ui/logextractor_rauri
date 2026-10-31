# Plugin Development Guide

This guide is designed for developers (and their AI Agents) to create new plugins for HappyTool.

## Architecture Overview

HappyTool uses a dynamic plugin system. Plugins are React components that are:
1.  **Registered** in `plugins/registry.ts`.
2.  **Wrapped** by `PluginContainer` for standardized rendering.
3.  **Encapsulated** to avoid hard dependencies on `App.tsx`.
4.  **Context-Aware** using `useHappyTool()` to access global state (Log Rules, Saved Requests, etc.).

> [!NOTE]
> All paths in this guide are relative to the **project root**. There is no `src` directory.


## Step-by-Step Plugin Creation

### 1. Create Plugin Component
Create a new directory in `components/[PluginName]`.
Create your main component file `components/[PluginName]/index.tsx`.

> [!IMPORTANT]
> Do NOT accept props for global state. Use the `useHappyTool` hook.

**Template:**
```tsx
import React from 'react';
import { useHappyTool } from '@/contexts/HappyToolContext';

const MyPlugin: React.FC = () => {
    // Access global state if needed
    const { logRules, setLogRules } = useHappyTool();

    return (
        <div className="flex flex-col h-full p-4 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-200">
            <h1 className="text-xl font-bold mb-4">My New Plugin</h1>
            {/* Your Content Here */}
        </div>
    );
};

export default MyPlugin;
```

### 2. Define Plugin Wrapper
Edit `plugins/core/wrappers.ts` to define your plugin metadata.

**Template:**
```typescript
import MyPluginComponent from '@/components/MyPlugin';
import * as Lucide from 'lucide-react';
import { ToolId } from '@/types'; // Add your ID to types.ts first!

export const MyPluginWrapper: HappyPlugin = {
    id: 'my-plugin-id', // Unique string ID
    name: 'My Plugin',
    icon: Lucide.Box, // Choose a Lucide icon
    component: MyPluginComponent,
    order: 10, // Position in sidebar
};
```

### 3. Register Plugin
Edit `plugins/registry.ts` to add your wrapper to `ALL_PLUGINS`.

```typescript
import { MyPluginWrapper } from './core/wrappers';

export const ALL_PLUGINS: HappyPlugin[] = [
    // ... existing plugins
    MyPluginWrapper
];
```

### 4. Add Types (Optional but Recommended)
If your plugin needs a new ID, update `ToolId` enum in `types.ts`.

## Global State Access
The `HappyToolContext` provides:
- **`logRules`**: Array of analysis rules.
- **`savedRequests`**: Saved API requests (PostTool).
- **`postGlobalVariables`**: Environment variables.

**Usage:**
```typescript
const { savedRequests } = useHappyTool();
```

## Toast Notifications
Use the `useToast` hook to show notifications.

```typescript
import { useToast } from '../../contexts/ToastContext';

const MyComponent = () => {
    const { addToast } = useToast();

    const handleSave = () => {
        // ... save logic
        addToast("Saved successfully!", "success");
    };
};
```

## Styling Guidelines
- Use **Tailwind CSS** for all styling.
- Support **Dark Mode** (`dark:` modifiers).
- Use `slate-50`/`slate-950` for backgrounds and `slate-900`/`slate-200` for text.
- Use `indigo-500` for primary actions/accents.
