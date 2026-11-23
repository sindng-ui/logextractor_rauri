export const GITHUB_REPO_OWNER = 'sindng-ui';
export const GITHUB_REPO_NAME = 'logextractor_rauri';
export const GITHUB_RELEASES_PAGE_URL = `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`;
const GITHUB_LATEST_API_URL = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`;

export const UPDATE_CACHE_KEY = 'happytool_update_cache_v1';
export const SKIPPED_VERSION_KEY = 'happytool_skipped_update_version_v1';
export const UPDATE_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface CachedUpdateInfo {
  checkedAt: number;
  etag?: string | null;
  result: AppUpdateCheckResult;
}

interface ParsedSemVer {
  major: number;
  minor: number;
  patch: number;
  pre: string[];
}

export function parseSemVer(raw: string): ParsedSemVer | null {
  const trimmed = raw.trim().replace(/^[vV]/, '');
  const withoutBuild = trimmed.split('+')[0] ?? '';
  const dashIdx = withoutBuild.indexOf('-');
  const core = dashIdx >= 0 ? withoutBuild.slice(0, dashIdx) : withoutBuild;
  const preStr = dashIdx >= 0 ? withoutBuild.slice(dashIdx + 1) : '';

  const parts = core.split('.');
  if (parts.length < 1 || parts.length > 3) return null;

  const nums = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
  if (nums.some((n) => !Number.isFinite(n))) return null;

  const pre = preStr
    ? preStr
        .split('.')
        .map((id) => id.trim())
        .filter(Boolean)
    : [];

  return {
    major: nums[0] ?? 0,
    minor: nums[1] ?? 0,
    patch: nums[2] ?? 0,
    pre,
  };
}

export function compareSemVer(aRaw: string, bRaw: string): number {
  const a = parseSemVer(aRaw);
  const b = parseSemVer(bRaw);
  if (!a || !b) return 0;

  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;

  if (a.pre.length === 0 && b.pre.length === 0) return 0;
  if (a.pre.length === 0) return 1;
  if (b.pre.length === 0) return -1;

  const len = Math.min(a.pre.length, b.pre.length);
  for (let i = 0; i < len; i++) {
    const left = a.pre[i];
    const right = b.pre[i];
    const leftNum = /^\d+$/.test(left);
    const rightNum = /^\d+$/.test(right);
    if (leftNum && rightNum) {
      const diff = Number(left) - Number(right);
      if (diff !== 0) return diff > 0 ? 1 : -1;
    } else if (leftNum !== rightNum) {
      return leftNum ? -1 : 1;
    } else if (left !== right) {
      return left > right ? 1 : -1;
    }
  }
  if (a.pre.length === b.pre.length) return 0;
  return a.pre.length > b.pre.length ? 1 : -1;
}

export function isNewerVersion(latest: string, current: string): boolean {
  return compareSemVer(latest, current) > 0;
}

export function normalizeVersionLabel(version?: string | null): string {
  if (!version) return '';
  return version.trim().replace(/^[vV]/, '');
}

export function formatBytes(bytes?: number | null): string {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function formatReleaseDate(isoDate?: string | null): string {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 14) return `${diffDays}d ago`;
  return date.toISOString().slice(0, 10);
}

/**
 * Extracts concise plain-text bullet points from a GitHub Release markdown body.
 */
export function parseReleaseNotesLines(body?: string | null, maxLines = 6): string[] {
  if (!body) return [];
  const lines = body
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^#{1,6}\s+/, '')
        .replace(/^[-*+]\s+/, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .trim()
    )
    .filter((line) => line.length > 0 && !/^[-_=]{3,}$/.test(line));

  return lines.slice(0, maxLines);
}

export function readUpdateCache(): CachedUpdateInfo | null {
  try {
    const raw = localStorage.getItem(UPDATE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedUpdateInfo;
    if (!parsed || typeof parsed.checkedAt !== 'number' || !parsed.result) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeUpdateCache(info: CachedUpdateInfo): void {
  try {
    localStorage.setItem(UPDATE_CACHE_KEY, JSON.stringify(info));
  } catch {
    // ignore storage quota errors
  }
}

export function getSkippedVersion(): string | null {
  try {
    const val = localStorage.getItem(SKIPPED_VERSION_KEY);
    return val ? normalizeVersionLabel(val) : null;
  } catch {
    return null;
  }
}

export function setSkippedVersion(version: string): void {
  try {
    localStorage.setItem(SKIPPED_VERSION_KEY, normalizeVersionLabel(version));
  } catch {
    // ignore
  }
}

export function clearSkippedVersion(): void {
  try {
    localStorage.removeItem(SKIPPED_VERSION_KEY);
  } catch {
    // ignore
  }
}

/**
 * Browser-only fallback check when running Vite without Tauri runtime.
 */
export async function checkUpdateViaBrowserFetch(
  currentVersion: string,
  etag?: string | null
): Promise<AppUpdateCheckResult> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
  };
  if (etag) {
    headers['If-None-Match'] = etag;
  }

  const res = await fetch(GITHUB_LATEST_API_URL, { headers });
  if (res.status === 304) {
    return {
      status: 'not_modified',
      hasUpdate: false,
      currentVersion,
      etag,
      isDevMode: true,
    };
  }
  if (res.status === 404) {
    return {
      status: 'up_to_date',
      hasUpdate: false,
      currentVersion,
      isDevMode: true,
    };
  }
  if (!res.ok) {
    throw new Error(`GitHub API returned HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    tag_name?: string;
    name?: string;
    body?: string;
    html_url?: string;
    published_at?: string;
    assets?: { name: string; browser_download_url: string; size: number }[];
  };

  const latestVersion = normalizeVersionLabel(data.tag_name ?? '');
  const hasUpdate = latestVersion ? isNewerVersion(latestVersion, currentVersion) : false;
  const assets = Array.isArray(data.assets) ? data.assets : [];
  const preferredAsset =
    assets.find((a) => a.name.toLowerCase().endsWith('.exe') && a.name.toLowerCase().includes('setup')) ||
    assets.find((a) => a.name.toLowerCase().endsWith('.exe')) ||
    assets.find((a) => a.name.toLowerCase().endsWith('.msi'));

  return {
    status: hasUpdate ? 'available' : 'up_to_date',
    hasUpdate,
    currentVersion,
    latestVersion: latestVersion || null,
    releaseName: data.name ?? null,
    releaseNotes: data.body ?? null,
    publishedAt: data.published_at ?? null,
    htmlUrl: data.html_url ?? GITHUB_RELEASES_PAGE_URL,
    downloadUrl: preferredAsset?.browser_download_url ?? null,
    assetName: preferredAsset?.name ?? null,
    assetSize: preferredAsset?.size ?? null,
    etag: res.headers.get('etag'),
    isDevMode: true,
  };
}
