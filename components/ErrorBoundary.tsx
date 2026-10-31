import React, { Component, ErrorInfo, ReactNode } from 'react';
import * as Lucide from 'lucide-react';

const { AlertTriangle, RefreshCw, Copy, ChevronDown, ChevronUp } = Lucide;

interface Props {
    children: ReactNode;
    fallbackUI?: (error: Error, reset: () => void) => ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
    componentName?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
    showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
            showDetails: false
        };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        const { onError, componentName } = this.props;

        console.error(`[ErrorBoundary${componentName ? ` - ${componentName}` : ''}] Caught error:`, error, errorInfo);

        this.setState({
            error,
            errorInfo
        });

        // Call custom error handler if provided
        if (onError) {
            try {
                onError(error, errorInfo);
            } catch (handlerError) {
                console.error('[ErrorBoundary] Error in onError handler:', handlerError);
            }
        }

        // TODO: Send to error reporting service (Sentry, etc.)
        // Example: Sentry.captureException(error, { extra: errorInfo });
    }

    handleReset = () => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
            showDetails: false
        });
    };

    handleCopyError = () => {
        const { error, errorInfo } = this.state;
        if (!error) return;

        const errorText = `
Error: ${error.message}
Stack: ${error.stack || 'No stack trace'}

Component Stack:
${errorInfo?.componentStack || 'No component stack'}
`;

        if (window.electronAPI?.copyToClipboard) {
            window.electronAPI.copyToClipboard(errorText);
            alert('Error details copied to clipboard');
        } else {
            navigator.clipboard.writeText(errorText).then(() => {
                alert('Error details copied to clipboard');
            });
        }
    };

    render() {
        const { hasError, error, errorInfo, showDetails } = this.state;
        const { children, fallbackUI, componentName } = this.props;

        if (!hasError) {
            return children;
        }

        // Custom fallback UI
        if (fallbackUI && error) {
            return fallbackUI(error, this.handleReset);
        }

        // Default fallback UI
        return (
            <div className="flex items-center justify-center min-h-[400px] p-8">
                <div className="max-w-2xl w-full bg-slate-900/50  border border-red-500/30 rounded-lg shadow-xl p-6">
                    {/* Header */}
                    <div className="flex items-start gap-4 mb-4">
                        <div className="p-3 bg-red-500/10 rounded-lg">
                            <AlertTriangle size={32} className="text-red-500" />
                        </div>
                        <div className="flex-1">
                            <h2 className="text-xl font-bold text-white mb-1">
                                Something went wrong
                            </h2>
                            {componentName && (
                                <p className="text-sm text-slate-400">
                                    in component: <span className="font-mono text-red-400">{componentName}</span>
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mb-4 p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
                            <p className="text-sm font-mono text-red-300">
                                {error.message || 'Unknown error'}
                            </p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 mb-4">
                        <button
                            onClick={this.handleReset}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                        >
                            <RefreshCw size={16} />
                            <span>Try Again</span>
                        </button>

                        <button
                            onClick={this.handleCopyError}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                        >
                            <Copy size={16} />
                            <span>Copy Error</span>
                        </button>

                        <button
                            onClick={() => this.setState({ showDetails: !showDetails })}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors ml-auto"
                        >
                            <span>Details</span>
                            {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                    </div>

                    {/* Error Details (Collapsible) */}
                    {showDetails && error && (
                        <div className="space-y-3">
                            {/* Stack Trace */}
                            {error.stack && (
                                <div>
                                    <h3 className="text-xs font-bold text-slate-400 mb-2">Stack Trace</h3>
                                    <div className="p-3 bg-slate-950/50 rounded border border-white/5 max-h-[200px] overflow-y-auto">
                                        <pre className="text-[10px] font-mono text-slate-300 whitespace-pre-wrap">
                                            {error.stack}
                                        </pre>
                                    </div>
                                </div>
                            )}

                            {/* Component Stack */}
                            {errorInfo?.componentStack && (
                                <div>
                                    <h3 className="text-xs font-bold text-slate-400 mb-2">Component Stack</h3>
                                    <div className="p-3 bg-slate-950/50 rounded border border-white/5 max-h-[200px] overflow-y-auto">
                                        <pre className="text-[10px] font-mono text-slate-300 whitespace-pre-wrap">
                                            {errorInfo.componentStack}
                                        </pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Footer */}
                    <div className="mt-4 pt-4 border-t border-white/10">
                        <p className="text-xs text-slate-500 text-center">
                            This error has been logged. If the problem persists, please report it to the development team.
                        </p>
                    </div>
                </div>
            </div>
        );
    }
}

// Convenience hook for functional components
export const useErrorHandler = () => {
    const [error, setError] = React.useState<Error | null>(null);

    React.useEffect(() => {
        if (error) {
            throw error;
        }
    }, [error]);

    return setError;
};
