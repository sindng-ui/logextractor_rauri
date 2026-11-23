import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkUpdateViaBrowserFetch,
  clearSkippedVersion,
  compareSemVer,
  formatBytes,
  formatReleaseDate,
  getSkippedVersion,
  isNewerVersion,
  normalizeVersionLabel,
  parseReleaseNotesLines,
  parseSemVer,
  readUpdateCache,
  setSkippedVersion,
  writeUpdateCache,
} from '../../utils/appUpdater';

describe('appUpdater utilities', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses and compares SemVer strings accurately', () => {
    expect(parseSemVer('v2.2.3')).toEqual({ major: 2, minor: 2, patch: 3, pre: [] });
    expect(parseSemVer('2.3.0-beta.1+build42')).toEqual({
      major: 2,
      minor: 3,
      patch: 0,
      pre: ['beta', '1'],
    });
    expect(parseSemVer('invalid')).toBeNull();

    expect(isNewerVersion('v2.2.3', '2.2.2')).toBe(true);
    expect(isNewerVersion('2.3.0', 'v2.2.9')).toBe(true);
    expect(isNewerVersion('3.0.0', '2.99.99')).toBe(true);
    expect(isNewerVersion('v2.2.2', '2.2.2')).toBe(false);
    expect(isNewerVersion('v2.2.1', '2.2.2')).toBe(false);
    expect(compareSemVer('v2.2.3', 'v2.2.3-rc.1')).toBe(1);
    expect(compareSemVer('v2.2.3-beta.2', 'v2.2.3-beta.1')).toBe(1);
    expect(normalizeVersionLabel(' V2.4.0 ')).toBe('2.4.0');
  });

  it('formats byte sizes, release dates, and markdown bullet lines', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(10 * 1024 * 1024)).toBe('10.0 MB');

    expect(formatReleaseDate('2025-01-15T10:00:00Z')).toBe('2025-01-15');
    expect(formatReleaseDate('not-a-date')).toBe('');

    const notes = `
      ## 🎉 HappyTool Tauri Edition v2.2.3
      - **Fast** One-click updater in \`AppsHomeView\`
      * Added \`ETag\` caching
      ---
      - Fixed memory leak
    `;
    expect(parseReleaseNotesLines(notes, 4)).toEqual([
      '🎉 HappyTool Tauri Edition v2.2.3',
      'Fast One-click updater in AppsHomeView',
      'Added ETag caching',
      'Fixed memory leak',
    ]);
  });

  it('reads and writes update cache and skipped version in localStorage', () => {
    expect(readUpdateCache()).toBeNull();
    writeUpdateCache({
      checkedAt: 123456789,
      etag: '"abc"',
      result: {
        status: 'available',
        hasUpdate: true,
        currentVersion: '2.2.2',
        latestVersion: '2.2.3',
        isDevMode: false,
      },
    });
    const cached = readUpdateCache();
    expect(cached?.etag).toBe('"abc"');
    expect(cached?.result.latestVersion).toBe('2.2.3');

    expect(getSkippedVersion()).toBeNull();
    setSkippedVersion('v2.2.3');
    expect(getSkippedVersion()).toBe('2.2.3');
    clearSkippedVersion();
    expect(getSkippedVersion()).toBeNull();
  });

  it('handles browser fallback GitHub API check for 200, 304, and 404 responses', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ etag: '"etag-1"' }),
      json: async () => ({
        tag_name: 'v2.3.0',
        name: 'HappyTool v2.3.0',
        body: '- New updater',
        html_url: 'https://github.com/sindng-ui/logextractor_rauri/releases/tag/v2.3.0',
        published_at: '2026-11-23T00:00:00Z',
        assets: [
          {
            name: 'HappyTool Tauri_2.3.0_x64_en-US.msi',
            browser_download_url: 'https://github.com/sindng-ui/logextractor_rauri/releases/download/v2.3.0/app.msi',
            size: 1000,
          },
          {
            name: 'HappyTool Tauri_2.3.0_x64-setup.exe',
            browser_download_url: 'https://github.com/sindng-ui/logextractor_rauri/releases/download/v2.3.0/setup.exe',
            size: 2000,
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res1 = await checkUpdateViaBrowserFetch('2.2.2');
    expect(res1.status).toBe('available');
    expect(res1.hasUpdate).toBe(true);
    expect(res1.latestVersion).toBe('2.3.0');
    expect(res1.assetName).toBe('HappyTool Tauri_2.3.0_x64-setup.exe');
    expect(res1.etag).toBe('"etag-1"');

    fetchMock.mockResolvedValueOnce({ ok: false, status: 304, headers: new Headers() });
    const res304 = await checkUpdateViaBrowserFetch('2.2.2', '"etag-1"');
    expect(res304.status).toBe('not_modified');

    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, headers: new Headers() });
    const res404 = await checkUpdateViaBrowserFetch('2.2.2');
    expect(res404.status).toBe('up_to_date');
    expect(res404.hasUpdate).toBe(false);
  });
});
