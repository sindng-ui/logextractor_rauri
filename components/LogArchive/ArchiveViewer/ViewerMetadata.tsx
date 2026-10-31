import React from 'react';
import { Calendar, FileText, ExternalLink } from 'lucide-react';
import { ArchivedLog } from '../db/LogArchiveDB';
import { formatDateFull, getTagColor } from '../utils';

interface ViewerMetadataProps {
    archive: ArchivedLog;
    lineCount: number;
}

export const ViewerMetadata = React.memo(({ archive, lineCount }: ViewerMetadataProps) => (
    <div className="viewer-metadata">
        <div className="viewer-meta-left">
            <span className="viewer-meta-item">
                <Calendar size={14} />
                <span>{formatDateFull(archive.createdAt)}</span>
            </span>
            <span className="viewer-meta-item">
                <FileText size={14} />
                <span>{lineCount} lines</span>
            </span>
            {archive.sourceFile && (
                <span className="viewer-meta-item source" title={archive.sourceFile}>
                    <ExternalLink size={14} />
                    <span>{archive.sourceFile.split(/[\\/]/).pop()}</span>
                </span>
            )}
        </div>

        {archive.tags.length > 0 && (
            <div className="viewer-tags">
                {archive.tags.map(tag => (
                    <span
                        key={tag}
                        className="viewer-tag"
                        style={{ backgroundColor: getTagColor(tag) }}
                    >
                        {tag}
                    </span>
                ))}
            </div>
        )}
    </div>
));
