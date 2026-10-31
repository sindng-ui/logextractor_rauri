import React from 'react';
import { StickyNote, Edit } from 'lucide-react';

interface ViewerMemoProps {
    memo: string;
    isEditing: boolean;
    editMemo: string;
    onToggleEdit: (isEditing: boolean) => void;
    onEditMemoChange: (val: string) => void;
    onSave: () => void;
}

export const ViewerMemo = React.memo(({
    memo,
    isEditing,
    editMemo,
    onToggleEdit,
    onEditMemoChange,
    onSave
}: ViewerMemoProps) => {
    return (
        <div style={{
            padding: '8px 16px',
            borderBottom: '1px solid rgba(99, 102, 241, 0.1)',
            minHeight: '32px',
        }}>
            {isEditing ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <StickyNote size={14} style={{ marginTop: '6px', opacity: 0.5, flexShrink: 0 }} />
                    <textarea
                        value={editMemo}
                        onChange={(e) => onEditMemoChange(e.target.value)}
                        onBlur={onSave}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                onSave();
                            }
                            if (e.key === 'Escape') {
                                e.stopPropagation();
                                onToggleEdit(false);
                            }
                        }}
                        autoFocus
                        maxLength={500}
                        placeholder="Enter memo..."
                        style={{
                            flex: 1,
                            background: 'rgba(15, 23, 42, 0.4)',
                            border: '1px solid rgba(99, 102, 241, 0.3)',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            color: '#e2e8f0',
                            fontSize: '12px',
                            resize: 'none',
                            outline: 'none',
                            fontFamily: 'inherit',
                            minHeight: '36px',
                            maxHeight: '80px',
                        }}
                    />
                </div>
            ) : (
                <div
                    onClick={() => onToggleEdit(true)}
                    style={{
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'center',
                        cursor: 'pointer',
                        fontSize: '12px',
                        color: memo ? '#94a3b8' : '#475569',
                        fontStyle: memo ? 'normal' : 'italic',
                        padding: '4px 0',
                        borderRadius: '4px',
                        transition: 'color 0.2s',
                    }}
                    title="Click to edit memo"
                >
                    <StickyNote size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
                    <span>{memo || 'Add memo...'}</span>
                    <Edit size={12} style={{ opacity: 0.3, marginLeft: 'auto' }} />
                </div>
            )}
        </div>
    );
});
