import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import PluginContainer from '../../components/PluginContainer';

// Mock plugin component to track mount/unmount and isActive prop
const MockComponent = vi.fn((props: { isActive: boolean }, _ref) => {
    const { isActive } = props;
    return (
        <div data-testid="mock-plugin" data-active={isActive}>
            {isActive ? 'Active Content' : 'Hidden Content'}
        </div>
    );
});

const mockPlugin = {
    id: 'test-plugin',
    name: 'Test Plugin',
    component: MockComponent,
    icon: () => null
};

describe('PluginContainer Persistence (Keep-Alive)', () => {
    it('should stay mounted but be hidden when isActive is false', () => {
        const { rerender } = render(
            <PluginContainer plugin={mockPlugin as any} isActive={true} />
        );

        // Should be visible and mount the component
        const element = screen.getByTestId('mock-plugin');
        expect(element).toBeDefined();
        expect(element.getAttribute('data-active')).toBe('true');
        expect(element.parentElement?.className).not.toContain('hidden');
        expect(MockComponent).toHaveBeenCalledTimes(1);

        // Rerender with isActive=false
        rerender(<PluginContainer plugin={mockPlugin as any} isActive={false} />);

        // IMPORTANT: Component should STILL be in the DOM
        const stillInDom = screen.queryByTestId('mock-plugin');
        expect(stillInDom).not.toBeNull();

        // But its data-active should be false and parent should be hidden
        expect(stillInDom?.getAttribute('data-active')).toBe('false');
        expect(stillInDom?.parentElement?.className).toContain('hidden');

        // Component should NOT have unmounted and remounted (checked via mock call count if re-renders are controlled, 
        // but the main proof is queryByTestId being non-null after rerender)
    });
});
