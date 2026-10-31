
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditableTag } from '../../components/LogViewer/ConfigSections/EditableTag';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

describe('EditableTag', () => {
    const defaultProps = {
        isEditing: false,
        value: 'TestTag',
        isActive: true,
        onStartEdit: vi.fn(),
        onCommit: vi.fn(),
        onDelete: vi.fn(),
        onNavigate: vi.fn(),
        isLast: false,
        groupIdx: 0,
        termIdx: 0,
    };

    it('renders correctly in view mode', () => {
        render(<EditableTag {...defaultProps} />);
        expect(screen.getByText('TestTag')).toBeInTheDocument();
    });

    it('switches to edit mode on click', () => {
        render(<EditableTag {...defaultProps} />);
        fireEvent.click(screen.getByText('TestTag'));
        expect(defaultProps.onStartEdit).toHaveBeenCalled();
    });

    it('renders input in edit mode and focuses it', () => {
        render(<EditableTag {...defaultProps} isEditing={true} />);
        const input = screen.getByRole('textbox');
        expect(input).toBeInTheDocument();
        expect(input).toHaveValue('TestTag');
        expect(input).toHaveFocus();
    });

    it('updates value on change', async () => {
        const user = userEvent.setup();
        render(<EditableTag {...defaultProps} isEditing={true} />);
        const input = screen.getByRole('textbox');
        await user.type(input, 'Updated');
        expect(input).toHaveValue('TestTagUpdated');
    });

    it('commits on Enter', async () => {
        const user = userEvent.setup();
        render(<EditableTag {...defaultProps} isEditing={true} />);
        const input = screen.getByRole('textbox');
        await user.type(input, '{Enter}');
        expect(defaultProps.onCommit).toHaveBeenCalledWith('TestTag');
        expect(defaultProps.onNavigate).toHaveBeenCalledWith('NextInput', false);
    });

    it('navigates on Tab (Next)', async () => {
        const user = userEvent.setup();
        render(<EditableTag {...defaultProps} isEditing={true} />);
        const input = screen.getByRole('textbox');
        await user.tab();
        expect(defaultProps.onCommit).toHaveBeenCalled();
        // userEvent.tab() logic might be complex with single input, 
        // relying on onKeyDown handler in component
        fireEvent.keyDown(input, { key: 'Tab' });
        expect(defaultProps.onNavigate).toHaveBeenCalledWith('NextInput', false);
    });

    it('navigates on Shift+Tab (Previous)', () => {
        render(<EditableTag {...defaultProps} isEditing={true} />);
        const input = screen.getByRole('textbox');
        fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
        expect(defaultProps.onNavigate).toHaveBeenCalledWith('PreviousInput', false);
    });

    it('reverts on Escape', () => {
        render(<EditableTag {...defaultProps} isEditing={true} />);
        const input = screen.getByRole('textbox');
        fireEvent.keyDown(input, { key: 'Escape' });
        expect(defaultProps.onCommit).toHaveBeenCalledWith('TestTag'); // Should match original value
    });
});
