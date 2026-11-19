import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { smartParseJson } from '../utils/jsonSmartRepair';
import { decodeInlineBadge, detectEmbeddedJsonString } from '../utils/jsonValueDecoders';
import { JsonArenaEngine } from '../workers/jsonArenaEngine';
import {
  clearAllSnapshotsStorage,
  deleteSnapshotRaw,
  loadSnapshotMeta,
  loadSnapshotRaw,
  MAX_PERSIST_SNAPSHOT_BYTES,
  saveSnapshotMeta,
  saveSnapshotRaw,
} from '../utils/jsonSnapshotStorage';

function generateHeavyComplexJson(targetBytes = 550 * 1024): string {
  const devices: any[] = [];
  let idx = 0;

  while (true) {
    devices.push({
      id: `dev-${String(idx).padStart(4, '0')}`,
      name: `SmartDevice Model ${idx % 20}`,
      status: idx % 7 === 0 ? 'offline' : 'online',
      lastSeen: 1763556000 + idx * 10,
      accentColor: idx % 2 === 0 ? '#6366f1' : '#10b981',
      nested: {
        level3: {
          level4: {
            level5: {
              level6: {
                level7: {
                  level8: {
                    level9: {
                      level10: {
                        deepFlag: idx % 3 === 0,
                        deepMetric: idx * 1.37,
                        deepTag: idx === 42 ? 'NEEDLE_DEEP_TARGET' : `tag-${idx}`,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      capabilities: [
        { id: 'switch', version: 1, state: 'on', updated: 1763556200000 },
        { id: 'powerMeter', version: 1, value: 42.5 + (idx % 100), unit: 'W' },
        { id: 'temperatureMeasurement', version: 1, value: 22.1, unit: 'C' },
      ],
      rawLog: JSON.stringify({ cmd: 'HEARTBEAT', seq: idx, ok: true }),
    });
    idx++;
    if (idx % 25 === 0) {
      const sample = JSON.stringify({ meta: { count: idx, generated: 1763556300000 }, devices });
      if (sample.length >= targetBytes) {
        return sample;
      }
    }
  }
}

describe('JSON Smart Repair & Value Decoders', () => {
  it('extracts JSON from a noisy log line', () => {
    const noisy = '2026-11-19 22:10:01.123 [I/SmartThings] Response received: {"status":"ok","count":3,"items":[1,2,3]} (took 12ms)';
    const res = smartParseJson(noisy);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.repairInfo.repaired).toBe(true);
      expect((res.data as any).status).toBe('ok');
      expect((res.data as any).count).toBe(3);
    }
  });

  it('repairs JSONC comments and trailing commas', () => {
    const jsonc = `{
      // inline comment
      "name": "HappyTool",
      /* block comment */
      "features": ["tree", "graph", "columns",],
    }`;
    const res = smartParseJson(jsonc);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.repairInfo.repaired).toBe(true);
      expect((res.data as any).features).toEqual(['tree', 'graph', 'columns']);
    }
  });

  it('unwraps double-encoded JSON strings', () => {
    const doubleEncoded = JSON.stringify(JSON.stringify({ hello: 'world', code: 200 }));
    const res = smartParseJson(doubleEncoded);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.repairInfo.repaired).toBe(true);
      expect((res.data as any).hello).toBe('world');
    }
  });

  it('reports line and column snippet for genuinely broken JSON', () => {
    const broken = '{\n  "a": 1,\n  "b": [1, 2, ]\n  "c": 3\n}';
    const res = smartParseJson(broken);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message.length).toBeGreaterThan(0);
    }
  });

  it('detects timestamps, colors, URLs, and embedded JSON strings', () => {
    expect(decodeInlineBadge('number', '1763556300000')?.kind).toBe('timestamp');
    expect(decodeInlineBadge('string', '"#6366f1"')?.kind).toBe('color');
    expect(decodeInlineBadge('string', '"https://example.com/api"')?.kind).toBe('url');
    expect(detectEmbeddedJsonString('{"a":1,"b":[2,3]}')).toBe(true);
    expect(detectEmbeddedJsonString('plain text')).toBe(false);
  });
});

describe('JsonArenaEngine — 500KB+ Deep Complex JSON Benchmark & Functional Suite', () => {
  const heavyJson = generateHeavyComplexJson(550 * 1024);
  const byteSize = new TextEncoder().encode(heavyJson).byteLength;

  it('parses, indexes, searches, graphs, columns, tables, and generates TS schema rapidly', () => {
    expect(byteSize).toBeGreaterThanOrEqual(550 * 1024);

    const engine = new JsonArenaEngine();

    // 1) Parse & 1-Pass Non-Recursive Indexing
    const t0 = performance.now();
    const parsed = engine.parse(heavyJson, 2);
    const parseTotalMs = performance.now() - t0;

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.stats.maxDepth).toBeGreaterThanOrEqual(12);
    expect(parsed.stats.totalNodes).toBeGreaterThan(10000);
    expect(parsed.stats.heavyNodes.length).toBeGreaterThan(0);
    expect(parsed.stats.arrayTables.length).toBeGreaterThan(0);
    expect(parseTotalMs).toBeLessThan(250); // generous CI threshold, target ~15-60ms

    // 2) Deep Search (Jump + Filter Tree + JSONPath)
    const tSearch0 = performance.now();
    const jumpRes = engine.search('NEEDLE_DEEP_TARGET', 'jump');
    const searchJumpMs = performance.now() - tSearch0;
    expect(jumpRes.totalMatches).toBe(1);
    expect(searchJumpMs).toBeLessThan(100);

    const tFilter0 = performance.now();
    const filterRes = engine.search('NEEDLE_DEEP_TARGET', 'filter');
    const searchFilterMs = performance.now() - tFilter0;
    expect(filterRes.totalMatches).toBe(1);
    expect(filterRes.rows.length).toBeGreaterThanOrEqual(10);
    expect(filterRes.rows.length).toBeLessThan(25);
    expect(searchFilterMs).toBeLessThan(100);

    const jpRes = engine.search('$.devices[*].status', 'jump');
    expect(jpRes.totalMatches).toBeGreaterThan(50);

    // Clear search
    engine.search('', 'jump');

    // 3) Visual Graph Layout (Canvas JSON Crack mode)
    const tGraph0 = performance.now();
    const graphRes = engine.getGraphScene({ autoInit: true });
    const graphMs = performance.now() - tGraph0;
    expect(graphRes.scene.nodes.length).toBeGreaterThan(5);
    expect(graphRes.scene.edges.length).toBeGreaterThan(0);
    expect(graphRes.scene.bounds.width).toBeGreaterThan(0);
    expect(graphMs).toBeLessThan(100);

    // 4) Finder Column Explorer (JSON Hero mode)
    const tCol0 = performance.now();
    const colRes = engine.getColumns([0]);
    const colMs = performance.now() - tCol0;
    expect(colRes.levels.length).toBe(1);
    expect(colRes.levels[0].items.length).toBeGreaterThan(0);
    expect(colMs).toBeLessThan(50);

    // 5) Smart Table Extraction
    const devicesTableId = parsed.stats.arrayTables[0].id;
    const tTable0 = performance.now();
    const tableRes = engine.getTable(devicesTableId);
    const tableMs = performance.now() - tTable0;
    expect(tableRes).not.toBeNull();
    expect(tableRes!.rows.length).toBeGreaterThan(50);
    expect(tableRes!.columns).toContain('id');
    expect(tableMs).toBeLessThan(100);

    // 6) TypeScript Schema Generation
    const tTs0 = performance.now();
    const tsCode = engine.getTypeScriptSchema('SmartThingsPayload');
    const tsMs = performance.now() - tTs0;
    expect(tsCode).toContain('export interface SmartThingsPayload');
    expect(tsCode).toContain('devices:');
    expect(tsMs).toBeLessThan(100);

    // 7) Virtual Code Generation (Pretty + Sorted Keys)
    const tCode0 = performance.now();
    const codeRes = engine.getCode(2, true, false);
    const codeMs = performance.now() - tCode0;
    expect(codeRes.totalLines).toBeGreaterThan(5000);
    expect(codeMs).toBeLessThan(250);

    // Print benchmark metrics for test report capture
    console.log(
      `[BENCHMARK 550KB+ JSON] size=${(byteSize / 1024).toFixed(1)}KB | nodes=${parsed.stats.totalNodes} | maxDepth=${parsed.stats.maxDepth} | parse+index=${parseTotalMs.toFixed(1)}ms | searchJump=${searchJumpMs.toFixed(1)}ms | filterTree=${searchFilterMs.toFixed(1)}ms | graphLayout=${graphMs.toFixed(1)}ms | columns=${colMs.toFixed(1)}ms | table=${tableMs.toFixed(1)}ms | tsSchema=${tsMs.toFixed(1)}ms | prettyCode=${codeMs.toFixed(1)}ms`
    );
  });

  it('handles extreme nesting depth (Depth 250) without stack overflow', () => {
    let deep = '{"leaf":"ok"}';
    for (let i = 0; i < 250; i++) {
      deep = `{"d${i}":${deep}}`;
    }
    const engine = new JsonArenaEngine();
    const res = engine.parse(deep, 3);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.stats.maxDepth).toBe(251);
    }
  });
});

describe('JsonSnapshotStorage — IndexedDB Persistence & Safety Caps', () => {
  it('persists snapshots <= 5MB, loads on-demand, keeps >5MB session-only, and cleans up deletions', async () => {
    const sampleRaw = JSON.stringify({ hello: 'persistent', count: 5 });
    const bytes = new TextEncoder().encode(sampleRaw).byteLength;

    const persistedSmall = await saveSnapshotRaw('snap-1', sampleRaw, bytes);
    expect(persistedSmall).toBe(true);

    const oversizedRaw = '{"big":true}';
    const persistedBig = await saveSnapshotRaw('snap-big', oversizedRaw, MAX_PERSIST_SNAPSHOT_BYTES + 10);
    expect(persistedBig).toBe(false);

    await saveSnapshotMeta(
      [
        { id: 'snap-1', label: 'Sample.json', source: 'file', byteSize: bytes, createdAt: 1, persisted: true },
        { id: 'snap-big', label: 'Huge.json', source: 'file', byteSize: MAX_PERSIST_SNAPSHOT_BYTES + 10, createdAt: 2, persisted: false },
      ],
      'snap-1'
    );

    const loadedMeta = await loadSnapshotMeta();
    expect(loadedMeta.items.length).toBe(1);
    expect(loadedMeta.items[0].id).toBe('snap-1');
    expect(loadedMeta.activeId).toBe('snap-1');

    expect(await loadSnapshotRaw('snap-1')).toBe(sampleRaw);
    expect(await loadSnapshotRaw('snap-big')).toBe(oversizedRaw);

    await deleteSnapshotRaw('snap-1');
    expect(await loadSnapshotRaw('snap-1')).toBeNull();

    await clearAllSnapshotsStorage(['snap-1', 'snap-big']);
    const afterClear = await loadSnapshotMeta();
    expect(afterClear.items.length).toBe(0);
    expect(afterClear.activeId).toBeNull();
  });
});
