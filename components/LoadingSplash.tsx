import React, { useEffect, useState, useRef } from 'react';
import { Activity } from 'lucide-react';
import packageJson from '../package.json';

interface LoadingSplashProps {
    onLoadingComplete?: () => void;
    waitForPlugins?: boolean;
}

const LoadingSplash: React.FC<LoadingSplashProps> = ({ onLoadingComplete, waitForPlugins = false }) => {
    const [logs, setLogs] = useState<string[]>([]);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('Initializing...');
    const [isComplete, setIsComplete] = useState(false);
    const [isBackendComplete, setIsBackendComplete] = useState(false);

    const startTimeRef = useRef<number>(Date.now());
    const logContainerRef = useRef<HTMLDivElement>(null);
    const MIN_DISPLAY_TIME = 2000;
    const completeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // ✅ 오토 스크롤: 로그 추가 시 하단 이동
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    useEffect(() => {
        const preLoader = document.getElementById('pre-loader');
        if (preLoader) {
            preLoader.style.opacity = '0';
            setTimeout(() => preLoader.remove(), 200);
        }
        window.electronAPI?.splashReady?.();

        // 🐧 가상 로그 리스트 (백엔드가 조용할 때 생동감 부여)
        const fakeSystemLogs = [
            'Analyzing system components...', 'Checking SharedArrayBuffer...', 'Syncing localStorage...',
            'Establishing IPC channels...', 'Warming up WASM workers...', 'Indexing session history...',
            'Loading plugin registry...', 'Mounting EasyPost modules...', 'Validating scripts...'
        ];

        let fakeIdx = 0;
        const fakeLogTimer = setInterval(() => {
            setLogs(prev => {
                const msg = `> [SYSTEM] ${fakeSystemLogs[fakeIdx % fakeSystemLogs.length]} ... [OK]`;
                fakeIdx++;
                return [...prev.slice(-99), msg];
            });
        }, 350);

        // ✅ 초기 상태 강제 동기화
        if (window.electronAPI?.getStartupStatus) {
            window.electronAPI.getStartupStatus().then((data: any) => {
                if (data) {
                    if (data.progress) setProgress(data.progress);
                    if (data.status) setStatus(data.status);
                    if (data.logs) setLogs(prev => [...prev, ...data.logs.map((l: string) => `> ${l}`)].slice(-99));
                    if (data.isComplete) setIsBackendComplete(true);
                }
            });
        }

        // ✅ IPC 리스너 (Preload의 unsubscriber 공식 지원 활용)
        const unProgress = window.electronAPI?.on?.('loading-progress', (data: any) => {
            if (data && typeof data === 'object') {
                if (typeof data.progress === 'number') setProgress(data.progress);
                if (data.status) setStatus(data.status);
            }
        });

        const unLog = window.electronAPI?.on?.('loading-log', (message: string) => {
            if (typeof message === 'string') {
                setLogs(prev => [...prev.slice(-99), `> ${message}`]);
            }
        });

        const unComplete = window.electronAPI?.on?.('loading-complete', () => {
            setIsBackendComplete(true);
            clearInterval(fakeLogTimer);
        });

        return () => {
            clearInterval(fakeLogTimer);
            unProgress?.();
            unLog?.();
            unComplete?.();
        };
    }, []);

    // 종료 및 상태 체크 로직
    useEffect(() => {
        const checkCompletion = setInterval(() => {
            if (!window.electronAPI) {
                setProgress(100);
                setIsComplete(true);
                setTimeout(() => onLoadingComplete?.(), 500);
                clearInterval(checkCompletion);
                return;
            }

            // 고정 로딩 애니메이션 (플러그인 대기 중)
            if (isBackendComplete && waitForPlugins) {
                setStatus('Finalizing plugins...');
                setProgress(prev => (prev < 98 ? 98 : Math.min(99.9, prev + (100 - prev) * 0.05)));
            }

            const safeToClose = isBackendComplete && !waitForPlugins;
            if (safeToClose && !isComplete && !completeTimeoutRef.current) {
                setProgress(100);
                setStatus('Ready!');
                const elapsedTime = Date.now() - startTimeRef.current;
                const remaining = Math.max(0, MIN_DISPLAY_TIME - elapsedTime);

                completeTimeoutRef.current = setTimeout(() => {
                    setIsComplete(true);
                    setTimeout(() => onLoadingComplete?.(), 800);
                }, remaining);
                clearInterval(checkCompletion);
            }
        }, 300);

        return () => clearInterval(checkCompletion);
    }, [waitForPlugins, isComplete, onLoadingComplete, isBackendComplete]);

    return (
        <div className={`fixed inset-0 z-50 bg-black ${isComplete ? 'opacity-0 pointer-events-none transition-opacity duration-700' : 'opacity-100'}`}>
            <div className="absolute inset-0 overflow-hidden">
                <div
                    ref={logContainerRef}
                    className="w-full h-full p-10 font-mono text-xs text-green-500/50 space-y-0.5 overflow-auto no-scrollbar flex flex-col justify-end max-w-[85%]"
                >
                    {logs.length === 0 ? (
                        <div className="flex flex-col justify-end h-full animate-pulse text-green-500/40">&gt; Initializing...</div>
                    ) : (
                        logs.map((log, index) => (
                            <div key={index} className="animate-fade-in whitespace-pre-wrap">{log}</div>
                        ))
                    )}
                    <div className="text-green-500/60 animate-pulse">&gt;_</div>
                </div>
            </div>

            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="absolute inset-0 bg-gradient-radial from-blue-500/10 via-transparent to-transparent opacity-40"></div>
                <div className="relative z-10 flex flex-col items-center space-y-8 px-8">
                    <div className="flex flex-col items-center space-y-4">
                        <div className="relative">
                            <Activity size={80} className="relative text-blue-400 animate-float" strokeWidth={1.5} />
                        </div>
                        <div className="text-center">
                            <h1 className="text-6xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                                HappyTool
                            </h1>
                            <p className="text-slate-500 text-sm mt-3 font-mono">v{packageJson.version}</p>
                        </div>
                    </div>

                    <div className="w-[500px] space-y-4">
                        <div className="flex items-center justify-between text-base">
                            <span className="text-slate-200 font-medium">{status}</span>
                            <span className="text-slate-400 font-mono text-sm">{Math.round(progress)}%</span>
                        </div>
                        <div className="relative h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800/50">
                            <div
                                className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-600 to-purple-600 transition-all duration-300 ease-out"
                                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                            >
                                <div className="absolute inset-0 bg-white/10 animate-pulse"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoadingSplash;
