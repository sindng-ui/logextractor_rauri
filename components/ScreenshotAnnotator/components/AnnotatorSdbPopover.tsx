import React, { useEffect, useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronRight,
  Clock,
  MonitorSmartphone,
  RefreshCw,
  Terminal,
  X,
} from 'lucide-react';
import { AnnotatorSdbSettings } from '../../../utils/annotatorSdbSettings';
import { SdbDeviceInfo } from '../hooks/useAnnotatorSdbCapture';

interface AnnotatorSdbPopoverProps {
  isOpen: boolean;
  settings: AnnotatorSdbSettings;
  devices: SdbDeviceInfo[];
  isScanning: boolean;
  isCapturing: boolean;
  countdownSec: number | null;
  lastError: string | null;
  onUpdateSettings: (patch: Partial<AnnotatorSdbSettings>) => void;
  onRefreshDevices: () => void;
  onCaptureNow: () => void;
  onClose: () => void;
}

const AnnotatorSdbPopover: React.FC<AnnotatorSdbPopoverProps> = ({
  isOpen,
  settings,
  devices,
  isScanning,
  isCapturing,
  countdownSec,
  lastError,
  onUpdateSettings,
  onRefreshDevices,
  onCaptureNow,
  onClose,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (isOpen) {
      onRefreshDevices();
    }
  }, [isOpen, onRefreshDevices]);

  if (!isOpen) return null;

  return (
    <div className="absolute top-[60px] right-4 z-40 w-[348px] bg-[#0f172a] border border-emerald-500/35 rounded-2xl shadow-2xl p-4 select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MonitorSmartphone size={15} className="text-emerald-300" />
          <span className="text-xs font-bold text-slate-100">SDB Device Capture</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Close (Esc)"
        >
          <X size={14} />
        </button>
      </div>

      {/* Target Device Selector */}
      <div className="space-y-2.5 mb-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-semibold text-slate-400">Target Device</label>
            <button
              type="button"
              onClick={onRefreshDevices}
              disabled={isScanning}
              className="text-[10px] font-bold text-emerald-300 hover:text-emerald-200 flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw size={10} className={isScanning ? 'animate-spin' : ''} />
              Rescan
            </button>
          </div>
          <select
            value={settings.deviceId}
            onChange={(e) => onUpdateSettings({ deviceId: e.target.value })}
            className="w-full h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-emerald-500/60 focus:outline-none text-xs font-mono text-slate-200"
          >
            <option value="">Auto-detect (first online device)</option>
            {settings.deviceId &&
              !devices.some((d) => d.id === settings.deviceId) && (
                <option value={settings.deviceId}>{settings.deviceId} (saved)</option>
              )}
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.id} ({d.type})
              </option>
            ))}
          </select>
        </div>

        {/* Remote IP Auto-Connect */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
            Remote IP (Auto-connect if offline)
          </label>
          <input
            type="text"
            value={settings.autoConnectIp}
            onChange={(e) => onUpdateSettings({ autoConnectIp: e.target.value })}
            placeholder="e.g. 192.168.250.250"
            className="w-full h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-emerald-500/60 focus:outline-none text-xs font-mono text-slate-200 placeholder-slate-600"
          />
        </div>

        {/* Shared SDB Path (synced with Log Extractor) */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
            SDB Path <span className="text-[10px] font-normal text-slate-500">(synced with Log Extractor)</span>
          </label>
          <input
            type="text"
            value={settings.sdbPath}
            onChange={(e) => onUpdateSettings({ sdbPath: e.target.value })}
            placeholder="sdb (system PATH)"
            className="w-full h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-emerald-500/60 focus:outline-none text-xs font-mono text-slate-200 placeholder-slate-600"
          />
        </div>
      </div>

      {/* Behavior & Delay Toggles */}
      <div className="space-y-2 pt-2.5 mb-3 border-t border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400">When canvas has image</span>
          <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => onUpdateSettings({ existingBehavior: 'ask' })}
              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors ${
                settings.existingBehavior === 'ask'
                  ? 'bg-emerald-600/80 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Ask (Stitch)
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ existingBehavior: 'replace' })}
              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors ${
                settings.existingBehavior === 'replace'
                  ? 'bg-emerald-600/80 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Replace
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <Clock size={11} />
            Capture Timer
          </span>
          <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => onUpdateSettings({ delaySec: 0 })}
              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors ${
                settings.delaySec === 0
                  ? 'bg-emerald-600/80 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Instant
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ delaySec: 3 })}
              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors ${
                settings.delaySec === 3
                  ? 'bg-emerald-600/80 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              3s Delay
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible Advanced Capture Command */}
      <div className="mb-3">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-200 transition-colors"
        >
          {showAdvanced ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Terminal size={11} />
          <span>Capture Command</span>
        </button>
        {showAdvanced && (
          <div className="mt-1.5">
            <input
              type="text"
              value={settings.customCommand}
              onChange={(e) => onUpdateSettings({ customCommand: e.target.value })}
              placeholder="Default: enlightenment_info -dump_screen"
              className="w-full h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-emerald-500/60 focus:outline-none text-[11px] font-mono text-slate-200 placeholder-slate-600"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Leave blank for <code className="text-slate-400">enlightenment_info -dump_screen</code> (optional <code className="text-slate-400">{'{out}'}</code> path).
            </p>
          </div>
        )}
      </div>

      {/* Last Error Banner */}
      {lastError && (
        <div className="mb-3 p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/35 text-[11px] font-mono text-rose-300 leading-snug max-h-20 overflow-y-auto custom-scrollbar break-words">
          {lastError}
        </div>
      )}

      {/* Primary Action Button */}
      <button
        type="button"
        disabled={isCapturing}
        onClick={() => {
          onClose();
          onCaptureNow();
        }}
        className="w-full h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors active:scale-[0.99]"
      >
        <Camera size={14} />
        <span>
          {isCapturing
            ? 'Capturing Device Screen…'
            : countdownSec !== null
              ? `Cancel (${countdownSec}s)`
              : settings.delaySec > 0
                ? `Capture in ${settings.delaySec}s (Ctrl+Shift+D)`
                : 'Capture Now (Ctrl+Shift+D)'}
        </span>
      </button>
    </div>
  );
};

export default React.memo(AnnotatorSdbPopover);
