import { useState } from 'react';
import { SpamLogResult } from '../types';

export function useLogSpamState() {
    const [isSpamAnalyzerOpen, setIsSpamAnalyzerOpen] = useState(false);
    const [isAnalyzingSpam, setIsAnalyzingSpam] = useState(false);
    const [spamResultsLeft, setSpamResultsLeft] = useState<SpamLogResult[]>([]);

    return {
        isSpamAnalyzerOpen, setIsSpamAnalyzerOpen,
        isAnalyzingSpam, setIsAnalyzingSpam,
        spamResultsLeft, setSpamResultsLeft
    };
}
