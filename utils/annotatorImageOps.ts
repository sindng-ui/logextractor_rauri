import { AnnotatorDocument } from '../types/screenshotAnnotator';
import { computeDocumentLayout } from './annotatorGeometry';
import { renderAnnotatorScene } from './annotatorCanvasRenderer';

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = src;
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Invalid DataURL result'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

export function rgbaToDataUrl(width: number, height: number, rgba: Uint8ClampedArray): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  const clamped = new Uint8ClampedArray(rgba.byteLength);
  clamped.set(rgba);
  const imgData = new ImageData(clamped, width, height);
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

export function stitchImages(
  baseImg: HTMLImageElement,
  incomingImg: HTMLImageElement,
  direction: 'right' | 'below',
  gap = 16
): { dataUrl: string; width: number; height: number } {
  const canvas = document.createElement('canvas');
  if (direction === 'right') {
    canvas.width = baseImg.naturalWidth + incomingImg.naturalWidth + gap;
    canvas.height = Math.max(baseImg.naturalHeight, incomingImg.naturalHeight);
  } else {
    canvas.width = Math.max(baseImg.naturalWidth, incomingImg.naturalWidth);
    canvas.height = baseImg.naturalHeight + incomingImg.naturalHeight + gap;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');

  // Subtle dark slate divider backdrop so mismatched sizes look clean
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (direction === 'right') {
    const y1 = Math.floor((canvas.height - baseImg.naturalHeight) / 2);
    const y2 = Math.floor((canvas.height - incomingImg.naturalHeight) / 2);
    ctx.drawImage(baseImg, 0, y1);
    ctx.drawImage(incomingImg, baseImg.naturalWidth + gap, y2);
    // Subtle center separator hairline
    ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.fillRect(baseImg.naturalWidth + Math.floor(gap / 2), 0, 1, canvas.height);
  } else {
    const x1 = Math.floor((canvas.width - baseImg.naturalWidth) / 2);
    const x2 = Math.floor((canvas.width - incomingImg.naturalWidth) / 2);
    ctx.drawImage(baseImg, x1, 0);
    ctx.drawImage(incomingImg, x2, baseImg.naturalHeight + gap);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.fillRect(0, baseImg.naturalHeight + Math.floor(gap / 2), canvas.width, 1);
  }

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
  };
}

export function renderDocumentToExportCanvas(
  doc: AnnotatorDocument,
  baseImg: HTMLImageElement,
  overlayCache: Map<string, HTMLImageElement>
): HTMLCanvasElement {
  const layout = computeDocumentLayout(doc);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, layout.outputWidth);
  canvas.height = Math.max(1, layout.outputHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');

  renderAnnotatorScene(ctx, {
    doc,
    baseImg,
    overlayCache,
    includeSelectionUI: false,
  });

  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
  quality = 0.94
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode canvas blob'));
      },
      mimeType,
      quality
    );
  });
}

export function createThumbnailDataUrl(
  sourceCanvas: HTMLCanvasElement,
  maxDim = 220
): string {
  const scale = Math.min(1, maxDim / Math.max(sourceCanvas.width, sourceCanvas.height));
  const w = Math.max(1, Math.round(sourceCanvas.width * scale));
  const h = Math.max(1, Math.round(sourceCanvas.height * scale));
  const thumb = document.createElement('canvas');
  thumb.width = w;
  thumb.height = h;
  const ctx = thumb.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(sourceCanvas, 0, 0, w, h);
  return thumb.toDataURL('image/jpeg', 0.72);
}

/** Generates a crisp sample UI screenshot offline so users can try all tools immediately */
export function createSampleScreenshotDataUrl(): { dataUrl: string; width: number; height: number } {
  const w = 1120;
  const h = 680;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0b1120';
  ctx.fillRect(0, 0, w, h);

  // Mock Top Window Bar
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, w, 48);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 47, w, 1);

  const dots = ['#ef4444', '#f59e0b', '#22c55e'];
  dots.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(24 + i * 20, 24, 5.5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('Edge Hub Diagnostics  —  device-tv-oled65 (192.168.0.42)', 96, 28);

  // Metric Cards
  const cards = [
    { title: 'CPU Load', val: '24.2%', sub: 'Nominal · 4 Cores', color: '#22c55e' },
    { title: 'Memory RSS', val: '189.4 MB', sub: 'Target < 320 MB', color: '#38bdf8' },
    { title: 'MQTT Latency', val: '412 ms', sub: 'Spike detected @ 14:22', color: '#f97316' },
    { title: 'API Token', val: 'st_live_99a4...e71c', sub: 'Sensitive · Redact before share', color: '#f43f5e' },
  ];
  cards.forEach((card, idx) => {
    const cx = 28 + idx * 270;
    const cy = 72;
    ctx.fillStyle = '#111827';
    ctx.fillRect(cx, cy, 252, 108);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx, cy, 252, 108);

    ctx.fillStyle = card.color;
    ctx.fillRect(cx, cy, 4, 108);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(card.title, cx + 18, cy + 28);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 22px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(card.val, cx + 18, cy + 64);

    ctx.fillStyle = '#64748b';
    ctx.font = '500 12px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(card.sub, cx + 18, cy + 90);
  });

  // Mock Log Terminal Panel
  ctx.fillStyle = '#090d16';
  ctx.fillRect(28, 204, 1064, 444);
  ctx.strokeStyle = '#1e293b';
  ctx.strokeRect(28, 204, 1064, 444);

  const logs = [
    ['14:21:58.102', 'INFO ', 'HubSync   : Connected to broker tls://edge.iot.internal:8883 (TLSv1.3)', '#94a3b8'],
    ['14:21:58.419', 'INFO ', 'AuthMgr   : Session verified user=granular.sim@company.com ip=10.24.18.92', '#94a3b8'],
    ['14:21:59.005', 'DEBUG', 'BleScan   : Discovered peripheral MAC=A4:C1:38:9F:2B:11 RSSI=-58dBm', '#64748b'],
    ['14:22:01.210', 'INFO ', 'RuleExec  : Triggered scene "Evening_Mode" -> 4 devices queued', '#94a3b8'],
    ['14:22:01.622', 'WARN ', 'NetBridge : Retry #1 for dev-ac-02 (timeout=412ms > threshold=250ms)', '#fbbf24'],
    ['14:22:01.988', 'ERROR', 'MqttClient: ETIMEDOUT(-110) on topic /v2/devices/dev-ac-02/commands', '#f87171'],
    ['14:22:02.014', 'INFO ', 'Failover  : Switched to local LAN direct channel 192.168.0.108:39500', '#38bdf8'],
    ['14:22:02.041', 'INFO ', 'RuleExec  : Command ACK received in 27ms (status=200 OK)', '#4ade80'],
    ['14:22:02.500', 'DEBUG', 'Telemetry : Flushed 128 events (0 dropped, queue=0)', '#64748b'],
    ['14:22:03.112', 'INFO ', 'HealthChk : All subsystems healthy. Ready for next cycle.', '#94a3b8'],
  ];

  ctx.font = '500 13.5px Consolas, "JetBrains Mono", monospace';
  logs.forEach(([time, lvl, msg, color], i) => {
    const y = 244 + i * 38;
    if (lvl.trim() === 'ERROR') {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
      ctx.fillRect(36, y - 20, 1048, 30);
    } else if (lvl.trim() === 'WARN') {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.10)';
      ctx.fillRect(36, y - 20, 1048, 30);
    }
    ctx.fillStyle = '#475569';
    ctx.fillText(time, 48, y);
    ctx.fillStyle = color;
    ctx.fillText(lvl, 168, y);
    ctx.fillText(msg, 232, y);
  });

  return { dataUrl: canvas.toDataURL('image/png'), width: w, height: h };
}
