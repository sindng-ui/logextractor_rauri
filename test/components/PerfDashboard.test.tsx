import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PerfDashboard } from '../../components/LogViewer/PerfDashboard';
import { ToastProvider } from '../../contexts/ToastContext';
import React from 'react';

// Mock framer-motion
vi.mock('framer-motion', () => {
    const Component = ({ children, ...props }: any) => {
        const { initial, animate, exit, transition, variants, ...cleanProps } = props;
        return <div {...cleanProps}>{children}</div>;
    };
    return {
        motion: new Proxy({}, {
            get: () => Component
        }),
        AnimatePresence: ({ children }: any) => <>{children}</>,
    };
});

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
};

// Mock HTMLCanvasElement
global.HTMLCanvasElement.prototype.getContext = () => {
    return {
        fillRect: () => { },
        clearRect: () => { },
        getImageData: () => { },
        putImageData: () => { },
        createImageData: () => { },
        setTransform: () => { },
        drawImage: () => { },
        save: () => { },
        fillText: () => { },
        restore: () => { },
        beginPath: () => { },
        moveTo: () => { },
        lineTo: () => { },
        closePath: () => { },
        stroke: () => { },
        translate: () => { },
        scale: () => { },
        rotate: () => { },
        arc: () => { },
        fill: () => { },
        measureText: () => ({ width: 0 }),
        transform: () => { },
        rect: () => { },
        clip: () => { },
        roundRect: () => { },
    } as any;
};

// Mock lucide-react icons manually
vi.mock('lucide-react', () => ({
    Activity: () => <div data-testid="icon-activity" />,
    Search: () => <div data-testid="icon-search" />,
    ChevronDown: () => <div data-testid="icon-chevron-down" />,
    ChevronUp: () => <div data-testid="icon-chevron-up" />,
    X: () => <div data-testid="icon-x" />,
    Filter: () => <div data-testid="icon-filter" />,
    AlertCircle: () => <div data-testid="icon-alert" />,
    ChevronLeft: () => <div data-testid="icon-chevron-left" />,
    ChevronRight: () => <div data-testid="icon-chevron-right" />,
    AlignLeft: () => <div data-testid="icon-align-left" />,
    CheckCircle2: () => <div data-testid="icon-check" />,
    Timer: () => <div data-testid="icon-timer" />,
    Maximize2: () => <div data-testid="icon-maximize" />,
    MoveRight: () => <div data-testid="icon-move-right" />,
    Clock: () => <div data-testid="icon-clock" />,
    LayoutDashboard: () => <div data-testid="icon-layout" />,
    Maximize: () => <div data-testid="icon-maximize" />,
    Minimize: () => <div data-testid="icon-minimize" />,
    Play: () => <div data-testid="icon-play" />,
    Settings: () => <div data-testid="icon-settings" />,
    Loader2: () => <div data-testid="icon-loader" />,
    Camera: () => <div data-testid="icon-camera" />,
    Star: () => <div data-testid="icon-star" />,
    Lock: () => <div data-testid="icon-lock" />,
    AlertTriangle: () => <div data-testid="icon-alert-triangle" />,
}));

describe('PerfDashboard Component', () => {
    const mockResult = {
        fileName: 'test.log',
        totalDuration: 1000,
        startTime: 0,
        endTime: 1000,
        logCount: 100,
        passCount: 5,
        failCount: 0,
        perfThreshold: 500,
        segments: [
            {
                id: 'seg1',
                name: 'Segment 1',
                startTime: 100,
                endTime: 200,
                duration: 100,
                startLine: 1,
                endLine: 2,
                type: 'step',
                status: 'pass',
                logs: [],
                lane: 1,
                tid: 'Main'
            }
        ],
        bottlenecks: []
    };

    it('should show "Ready to Analyze" when no result and not analyzing', async () => {
        render(
            <ToastProvider>
                <PerfDashboard
                    isOpen={true}
                    onClose={() => { }}
                    result={null}
                    isAnalyzing={false}
                    targetTime={500}
                    isActive={true}
                />
            </ToastProvider>
        );
        expect(await screen.findByText(/Ready to Analyze/i)).toBeInTheDocument();
    });

    it('should render header with result summary when result is provided', async () => {
        render(
            <ToastProvider>
                <PerfDashboard
                    isOpen={true}
                    onClose={() => { }}
                    result={mockResult as any}
                    isAnalyzing={false}
                    targetTime={500}
                    isActive={true}
                />
            </ToastProvider>
        );

        // This is in the header summary line
        expect(await screen.findByText(/1,000ms • 1 segments • Limit: 500ms/i)).toBeInTheDocument();
    });

    it('should render scorecards in full screen mode', async () => {
        render(
            <ToastProvider>
                <PerfDashboard
                    isOpen={true}
                    onClose={() => { }}
                    result={mockResult as any}
                    isAnalyzing={false}
                    targetTime={500}
                    isActive={true}
                    isFullScreen={true}
                />
            </ToastProvider>
        );

        expect(await screen.findByText('Segments')).toBeInTheDocument();
        expect(await screen.findByText(/Total Time/i)).toBeInTheDocument();
        expect(await screen.findByText(/1,000ms/i)).toBeInTheDocument();
    });

    it('should show search input', async () => {
        render(
            <ToastProvider>
                <PerfDashboard
                    isOpen={true}
                    onClose={() => { }}
                    result={mockResult as any}
                    isAnalyzing={false}
                    targetTime={500}
                    isActive={true}
                />
            </ToastProvider>
        );

        expect(await screen.findByPlaceholderText(/Search/i)).toBeInTheDocument();
    });

    it('should allow toggling thread lock mode via TID label click', async () => {
        const { container } = render(
            <ToastProvider>
                <PerfDashboard
                    isOpen={true}
                    onClose={() => { }}
                    result={mockResult as any}
                    isAnalyzing={false}
                    targetTime={500}
                    isActive={true}
                />
            </ToastProvider>
        );

        // Find the TID label `Main` rendered by the sidebar
        const tidLabels = await screen.findAllByText('Main');
        expect(tidLabels.length).toBeGreaterThan(0);

        // Click on the TID label wrapper to toggle the thread lock
        const labelWrapper = tidLabels[0].closest('div');
        if (labelWrapper) {
            fireEvent.click(labelWrapper);
        }
    });
});
