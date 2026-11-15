import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { HappyComboSection } from '../../components/LogViewer/ConfigSections/HappyComboSection';
import type { LogRule } from '../../types';

const createBaseRule = (): LogRule => ({
    id: 'rule-1',
    name: 'New Analysis',
    includeGroups: [],
    happyGroups: [],
    excludes: [],
    happyCombosCaseSensitive: false,
    blockListCaseSensitive: false,
    highlights: [],
    showRawLogLines: false,
});

describe('HappyComboSection', () => {
    it('opens an empty combo input without NewRoot and without triggering updateCurrentRule on ADD COMBO click', () => {
        const updateCurrentRule = vi.fn();

        render(
            <HappyComboSection
                currentConfig={createBaseRule()}
                updateCurrentRule={updateCurrentRule}
                groupedRoots={[]}
                collapsedRoots={new Set()}
                onToggleRootCollapse={vi.fn()}
                handleToggleRoot={vi.fn()}
                happyCombosCaseSensitive={false}
                tabId="tab-1"
                setCollapsedRoots={vi.fn()}
            />
        );

        fireEvent.click(screen.getByText('ADD COMBO'));

        expect(updateCurrentRule).not.toHaveBeenCalled();
        const input = screen.getByPlaceholderText('Enter keyword...') as HTMLInputElement;
        expect(input).toBeInTheDocument();
        expect(input.value).toBe('');
        expect(screen.queryByText(/NewRoot/i)).not.toBeInTheDocument();

        // Blurring or pressing Enter with empty text must still NOT trigger filtering
        fireEvent.blur(input);
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(updateCurrentRule).not.toHaveBeenCalled();
    });

    it('also creates empty draft via Create New Combo Group and cancels cleanly on Escape', () => {
        const updateCurrentRule = vi.fn();

        render(
            <HappyComboSection
                currentConfig={createBaseRule()}
                updateCurrentRule={updateCurrentRule}
                groupedRoots={[]}
                collapsedRoots={new Set()}
                onToggleRootCollapse={vi.fn()}
                handleToggleRoot={vi.fn()}
                happyCombosCaseSensitive={false}
                tabId="tab-1"
                setCollapsedRoots={vi.fn()}
            />
        );

        fireEvent.click(screen.getByText('Create New Combo Group'));
        expect(updateCurrentRule).not.toHaveBeenCalled();

        const input = screen.getByPlaceholderText('Enter keyword...') as HTMLInputElement;
        fireEvent.keyDown(input, { key: 'Escape' });

        expect(screen.queryByPlaceholderText('Enter keyword...')).not.toBeInTheDocument();
        expect(updateCurrentRule).not.toHaveBeenCalled();
    });

    it('commits entered keyword and triggers updateCurrentRule only when user submits non-empty text', () => {
        const updateCurrentRule = vi.fn();

        render(
            <HappyComboSection
                currentConfig={createBaseRule()}
                updateCurrentRule={updateCurrentRule}
                groupedRoots={[]}
                collapsedRoots={new Set()}
                onToggleRootCollapse={vi.fn()}
                handleToggleRoot={vi.fn()}
                happyCombosCaseSensitive={false}
                tabId="tab-1"
                setCollapsedRoots={vi.fn()}
            />
        );

        fireEvent.click(screen.getByText('ADD COMBO'));
        const input = screen.getByPlaceholderText('Enter keyword...') as HTMLInputElement;

        fireEvent.change(input, { target: { value: '  Bluetooth  ' } });
        // Typing alone does not commit prematurely before Enter/Tab/Blur
        expect(updateCurrentRule).not.toHaveBeenCalled();

        fireEvent.keyDown(input, { key: 'Enter' });
        expect(updateCurrentRule).toHaveBeenCalledTimes(1);
        expect(updateCurrentRule).toHaveBeenCalledWith({
            happyGroups: [
                expect.objectContaining({
                    tags: ['Bluetooth'],
                    enabled: true,
                }),
            ],
        });
    });
});
