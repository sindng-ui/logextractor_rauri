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

    it('renders full combo basic set (+ tag and Add Branch) on ADD COMBO and allows configuring branches before triggering search', () => {
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

        // Full combo basic set UI is immediately visible without triggering search
        const rootInput = screen.getByPlaceholderText('Enter keyword...') as HTMLInputElement;
        const firstTagInput = screen.getByPlaceholderText('+ tag') as HTMLInputElement;
        const addBranchBtn = screen.getByText('Add Branch');

        expect(rootInput).toBeInTheDocument();
        expect(firstTagInput).toBeInTheDocument();
        expect(addBranchBtn).toBeInTheDocument();
        expect(updateCurrentRule).not.toHaveBeenCalled();

        // Enter root + Tab + branch tags without triggering premature searches
        fireEvent.change(rootInput, { target: { value: 'input' } });
        fireEvent.keyDown(rootInput, { key: 'Tab' });
        fireEvent.change(firstTagInput, { target: { value: 'start' } });
        fireEvent.keyDown(firstTagInput, { key: 'Enter' });
        fireEvent.change(firstTagInput, { target: { value: 'process' } });
        fireEvent.keyDown(firstTagInput, { key: 'Enter' });

        // Add second OR branch inside draft card
        fireEvent.click(addBranchBtn);
        const tagInputs = screen.getAllByPlaceholderText('+ tag') as HTMLInputElement[];
        expect(tagInputs).toHaveLength(2);
        fireEvent.change(tagInputs[1], { target: { value: 'touch' } });

        // Still not committed yet until user submits!
        expect(updateCurrentRule).not.toHaveBeenCalled();

        // Submit from empty first branch + tag or root Enter
        fireEvent.keyDown(tagInputs[0], { key: 'Enter' });
        expect(updateCurrentRule).toHaveBeenCalledTimes(1);
        expect(updateCurrentRule).toHaveBeenCalledWith({
            happyGroups: [
                expect.objectContaining({ tags: ['input', 'start', 'process'], enabled: true }),
                expect.objectContaining({ tags: ['input', 'touch'], enabled: true }),
            ],
        });
    });
});
