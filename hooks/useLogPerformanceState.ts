import { useState } from 'react';
import { AnalysisResult } from '../utils/perfAnalysis';

export function useLogPerformanceState() {
    const [leftPerformanceHeatmap, setLeftPerformanceHeatmap] = useState<number[]>([]);
    const [rightPerformanceHeatmap, setRightPerformanceHeatmap] = useState<number[]>([]);

    // Performance Analysis States
    const [leftPerfAnalysisResult, setLeftPerfAnalysisResult] = useState<AnalysisResult | null>(null);
    const [rightPerfAnalysisResult, setRightPerfAnalysisResult] = useState<AnalysisResult | null>(null);
    const [isAnalyzingPerformanceLeft, setIsAnalyzingPerformanceLeft] = useState(false);
    const [isAnalyzingPerformanceRight, setIsAnalyzingPerformanceRight] = useState(false);

    return {
        leftPerformanceHeatmap, setLeftPerformanceHeatmap,
        rightPerformanceHeatmap, setRightPerformanceHeatmap,
        leftPerfAnalysisResult, setLeftPerfAnalysisResult,
        rightPerfAnalysisResult, setRightPerfAnalysisResult,
        isAnalyzingPerformanceLeft, setIsAnalyzingPerformanceLeft,
        isAnalyzingPerformanceRight, setIsAnalyzingPerformanceRight
    };
}
