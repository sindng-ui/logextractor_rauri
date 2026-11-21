import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { FileText, Braces, Camera } from 'lucide-react';
import AppsHomeView from '../../components/Apps/AppsHomeView';
import AppsLauncherModal from '../../components/Apps/AppsLauncherModal';
import AppsLauncherPanel, { computeLauncherPanelHeight } from '../../components/Apps/AppsLauncherPanel';
import { AppLauncherEntry } from '../../plugins/appsRegistry';

const createMockApps = (): AppLauncherEntry[] => [
  {
    id: 'LOG_EXTRACTOR',
    name: 'Log Extractor',
    subtitle: 'Log Analyzer',
    description: 'Log analyzer',
    quickHint: 'Drop .log',
    chips: ['1GB+ Rust'],
    icon: FileText,
    gradient: 'from-emerald-500 to-teal-500',
    accentBg: 'bg-emerald-600/85',
    accentText: 'text-emerald-200',
    radialGlow: 'rgba(16, 185, 129, 0.22)',
    dockShadow: '0 8px 20px rgba(16, 185, 129, 0.36)',
    sweepGradient: 'linear-gradient(90deg, transparent, white, transparent)',
    edgeBarClass: 'bg-emerald-400',
    activeRowClass: 'bg-emerald-500/15',
    chipClass: 'bg-emerald-500/15',
    ghostClass: 'text-emerald-300',
    preload: vi.fn().mockResolvedValue(undefined),
    component: React.lazy(async () => ({ default: () => null })),
  },
  {
    id: 'JSON_TOOLS',
    name: 'JSON Beautify',
    subtitle: 'Visual Analyzer',
    description: 'JSON analyzer',
    quickHint: 'Ctrl+V',
    chips: ['Tree'],
    icon: Braces,
    gradient: 'from-indigo-500 to-cyan-500',
    accentBg: 'bg-indigo-600/85',
    accentText: 'text-indigo-200',
    radialGlow: 'rgba(99, 102, 241, 0.22)',
    dockShadow: '0 8px 20px rgba(99, 102, 241, 0.38)',
    sweepGradient: 'linear-gradient(90deg, transparent, white, transparent)',
    edgeBarClass: 'bg-indigo-400',
    activeRowClass: 'bg-indigo-500/15',
    chipClass: 'bg-indigo-500/15',
    ghostClass: 'text-indigo-300',
    preload: vi.fn().mockResolvedValue(undefined),
    component: React.lazy(async () => ({ default: () => null })),
  },
  {
    id: 'SCREENSHOT_ANNOTATOR',
    name: 'Snap Studio',
    subtitle: 'Quick Annotator',
    description: 'Screenshot annotator',
    quickHint: 'Paste',
    chips: ['Arrows'],
    icon: Camera,
    gradient: 'from-rose-500 to-amber-500',
    accentBg: 'bg-rose-600/85',
    accentText: 'text-rose-200',
    radialGlow: 'rgba(244, 63, 94, 0.22)',
    dockShadow: '0 8px 20px rgba(244, 63, 94, 0.36)',
    sweepGradient: 'linear-gradient(90deg, transparent, white, transparent)',
    edgeBarClass: 'bg-rose-400',
    activeRowClass: 'bg-rose-500/15',
    chipClass: 'bg-rose-500/15',
    ghostClass: 'text-rose-300',
    preload: vi.fn().mockResolvedValue(undefined),
    component: React.lazy(async () => ({ default: () => null })),
  },
];

describe('Apps Launcher Rendering & Listener Optimizations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('AppsHomeView binds window keydown listener once across arrow navigation and selects accurately', () => {
    const apps = createMockApps();
    const onSelectApp = vi.fn();
    const onOpenSettings = vi.fn();
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    render(
      <AppsHomeView
        apps={apps}
        onSelectApp={onSelectApp}
        onOpenSettings={onOpenSettings}
      />
    );

    const initialKeydownAdds = addSpy.mock.calls.filter(([evt]) => evt === 'keydown').length;
    const initialKeydownRemoves = removeSpy.mock.calls.filter(([evt]) => evt === 'keydown').length;

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowUp' });

    const afterNavAdds = addSpy.mock.calls.filter(([evt]) => evt === 'keydown').length;
    const afterNavRemoves = removeSpy.mock.calls.filter(([evt]) => evt === 'keydown').length;

    expect(afterNavAdds).toBe(initialKeydownAdds);
    expect(afterNavRemoves).toBe(initialKeydownRemoves);

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onSelectApp).toHaveBeenCalledWith('JSON_TOOLS');

    fireEvent.keyDown(window, { key: '3' });
    expect(onSelectApp).toHaveBeenCalledWith('SCREENSHOT_ANNOTATOR');
  });

  it('AppsLauncherModal is memoized and does not re-bind keydown listener on focus changes', () => {
    expect((AppsLauncherModal as any).$$typeof).toBe(Symbol.for('react.memo'));

    const apps = createMockApps();
    const onSelectApp = vi.fn();
    const onClose = vi.fn();
    const addSpy = vi.spyOn(window, 'addEventListener');

    render(
      <AppsLauncherModal
        isOpen={true}
        onClose={onClose}
        apps={apps}
        activePluginId="LOG_EXTRACTOR"
        onSelectApp={onSelectApp}
      />
    );

    const initialKeydownAdds = addSpy.mock.calls.filter(([evt]) => evt === 'keydown').length;

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowDown' });

    const afterNavAdds = addSpy.mock.calls.filter(([evt]) => evt === 'keydown').length;
    expect(afterNavAdds).toBe(initialKeydownAdds);

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onSelectApp).toHaveBeenCalledWith('SCREENSHOT_ANNOTATOR');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('AppsLauncherPanel reuses persistent DOM sweep layers via WAAPI without unmounting/remounting', () => {
    const apps = createMockApps();
    const cancelMock = vi.fn();
    const animateMock = vi.fn(() => ({ cancel: cancelMock }) as unknown as Animation);
    const originalAnimate = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = animateMock;

    try {
      const { container, rerender, unmount } = render(
        <AppsLauncherPanel
          apps={apps}
          activePluginId={null}
          focusedIndex={0}
          sweepTick={1}
          mode="home"
          onFocusChange={vi.fn()}
          onSelectApp={vi.fn()}
        />
      );

      const sweepElBefore = container.querySelector('.w-\\[38\\%\\]');
      expect(sweepElBefore).not.toBeNull();
      expect(animateMock).toHaveBeenCalledTimes(2); // glint + sweep

      rerender(
        <AppsLauncherPanel
          apps={apps}
          activePluginId={null}
          focusedIndex={1}
          sweepTick={2}
          mode="home"
          onFocusChange={vi.fn()}
          onSelectApp={vi.fn()}
        />
      );

      const sweepElAfter = container.querySelector('.w-\\[38\\%\\]');
      expect(sweepElAfter).toBe(sweepElBefore); // exact same DOM node, zero remount
      expect(cancelMock).toHaveBeenCalledTimes(2); // cancelled previous animations cleanly
      expect(animateMock).toHaveBeenCalledTimes(4);

      unmount();
      expect(cancelMock).toHaveBeenCalledTimes(4); // cancelled on unmount
    } finally {
      HTMLElement.prototype.animate = originalAnimate;
    }
  });

  it('computeLauncherPanelHeight scales dynamically for 4-5 apps and caps cleanly for 6+ apps', () => {
    expect(computeLauncherPanelHeight(1)).toBe(280);
    expect(computeLauncherPanelHeight(3)).toBe(280);
    expect(computeLauncherPanelHeight(4)).toBe(336);
    expect(computeLauncherPanelHeight(5)).toBe(396);
    expect(computeLauncherPanelHeight(6)).toBe(404);
    expect(computeLauncherPanelHeight(10)).toBe(404);
  });

  it('AppsLauncherPanel expands height for 4+ apps, renders description, and scrolls focused card into view', () => {
    const baseApps = createMockApps();
    const sixApps: AppLauncherEntry[] = [
      ...baseApps,
      ...baseApps.map((app, i) => ({
        ...app,
        id: `${app.id}_EXTRA_${i}`,
        name: `${app.name} ${i + 4}`,
        description: `Extended app description ${i + 4}`,
      })),
    ];

    const scrollIntoViewMock = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    try {
      const { container, rerender, getByText } = render(
        <AppsLauncherPanel
          apps={sixApps}
          activePluginId={null}
          focusedIndex={0}
          sweepTick={1}
          mode="home"
          onFocusChange={vi.fn()}
          onSelectApp={vi.fn()}
        />
      );

      const panelRoot = container.firstElementChild as HTMLElement;
      expect(panelRoot.style.height).toBe('404px');
      expect(panelRoot.style.maxHeight).toBe('calc(100vh - 140px)');
      expect(getByText('Log analyzer')).toBeTruthy();

      rerender(
        <AppsLauncherPanel
          apps={sixApps}
          activePluginId={null}
          focusedIndex={5}
          sweepTick={2}
          mode="popover"
          onFocusChange={vi.fn()}
          onSelectApp={vi.fn()}
        />
      );

      expect(panelRoot.style.maxHeight).toBe('calc(100vh - 96px)');
      expect(getByText('Extended app description 6')).toBeTruthy();
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });
});
