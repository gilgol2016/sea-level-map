import type { Map as MapLibreMap } from 'maplibre-gl';
import rawGlobalPopData from '../data/globalPopulationImpact.json';
import { formatPopulation } from './formatters';
import { PopulationImpact } from '../types';

const POP_IMPACT_DATA: PopulationImpact[] = rawGlobalPopData as PopulationImpact[];

export interface SnapshotMetadata {
  title: string;
  subtitle: string;
  badgeText: string;
  impactText: string;
  submergedCitiesText?: string;
  attribution: string;
}

/**
 * Formats standard filename for snapshot export.
 * e.g., sea-level-explorer-plus-15m.png or sea-level-explorer-plus-15m-1727339000000.png
 */
export function formatSnapshotFilename(seaLevel: number, timestamp?: number): string {
  const levelStr = seaLevel > 0 ? `plus-${seaLevel}m` : '0m';
  if (timestamp !== undefined) {
    return `sea-level-explorer-${levelStr}-${timestamp}.png`;
  }
  return `sea-level-explorer-${levelStr}.png`;
}

/**
 * Generates composite metadata card text and metrics for any sea level elevation.
 */
export function getSnapshotMetadata(
  seaLevel: number,
  displacedPopText?: string,
  submergedCitiesCount?: number
): SnapshotMetadata {
  const clampedLevel = Math.max(0, Math.min(1000, Math.round(seaLevel)));
  const impactItem = POP_IMPACT_DATA[clampedLevel];

  let impactText = displacedPopText || '';
  if (!impactText) {
    if (seaLevel <= 0) {
      impactText = 'Baseline (0 Displaced)';
    } else if (impactItem) {
      impactText = `~${formatPopulation(impactItem.population)} People Displaced (${impactItem.percentage}% of Earth)`;
    } else {
      impactText = 'Global Population Displaced Model';
    }
  }

  const badgeText = seaLevel > 0
    ? `+${seaLevel}m Hypothetical Sea Level Rise`
    : "0m Baseline (Today's Sea Level)";

  const submergedCitiesText = submergedCitiesCount !== undefined && submergedCitiesCount > 0
    ? `${submergedCitiesCount} Tracked Cities Submerged`
    : undefined;

  return {
    title: 'Global Sea Level Explorer',
    subtitle: '0–1,000m Geographic Elevation Model',
    badgeText,
    impactText,
    submergedCitiesText,
    attribution: 'Map: © OpenStreetMap, © CARTO • Elevation: AWS Terrarium DEM'
  };
}

/**
 * Draws rounded rectangle path onto canvas 2D context.
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Draws sleek presentation metadata card onto canvas.
 */
export function drawMetadataCard(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  metadata: SnapshotMetadata
): void {
  const margin = Math.max(16, Math.min(24, Math.floor(canvasWidth * 0.02)));
  const cardWidth = Math.min(420, canvasWidth - margin * 2);
  const cardHeight = metadata.submergedCitiesText ? 168 : 148;
  const cardX = margin;
  const cardY = canvasHeight - cardHeight - margin;

  ctx.save();

  // Glassmorphism card shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 6;

  // Card background fill
  ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
  drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 14);
  ctx.fill();

  // Reset shadow for borders and content
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Card border
  ctx.strokeStyle = 'rgba(71, 85, 105, 0.65)';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 14);
  ctx.stroke();

  // Accent vertical indicator
  ctx.fillStyle = '#06b6d4';
  drawRoundedRect(ctx, cardX + 16, cardY + 16, 4, 20, 2);
  ctx.fill();

  // Title
  ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(metadata.title, cardX + 26, cardY + 31);

  // Sea level badge pill
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const badgeMetrics = ctx.measureText(metadata.badgeText);
  const badgePillW = badgeMetrics.width + 16;
  const badgePillH = 22;
  const badgeX = cardX + 16;
  const badgeY = cardY + 44;

  ctx.fillStyle = 'rgba(6, 182, 212, 0.18)';
  drawRoundedRect(ctx, badgeX, badgeY, badgePillW, badgePillH, 6);
  ctx.fill();

  ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, badgeX, badgeY, badgePillW, badgePillH, 6);
  ctx.stroke();

  ctx.fillStyle = '#38bdf8';
  ctx.fillText(metadata.badgeText, badgeX + 8, badgeY + 15);

  // Global Impact metric
  ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#e2e8f0';
  const impactY = badgeY + badgePillH + 18;
  ctx.fillText(`👥 ${metadata.impactText}`, cardX + 16, impactY);

  let currentY = impactY;
  if (metadata.submergedCitiesText) {
    currentY += 18;
    ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`🏙️ ${metadata.submergedCitiesText}`, cardX + 16, currentY);
  }

  // Divider line
  currentY += 10;
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 16, currentY);
  ctx.lineTo(cardX + cardWidth - 16, currentY);
  ctx.stroke();

  // Attribution
  currentY += 14;
  ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(metadata.attribution, cardX + 16, currentY);

  ctx.restore();
}

/**
 * Captures the current MapLibre map canvas with high-resolution presentation overlay
 * and triggers a direct PNG file download in the browser.
 */
export interface SnapshotExportResult {
  copiedToClipboard: boolean;
  filename: string;
}

/**
 * Captures the current MapLibre map canvas with high-resolution presentation overlay,
 * automatically copies the image to the system clipboard (so user can paste with Ctrl+V),
 * and triggers a direct PNG file download in the browser.
 */
export async function captureMapSnapshot(
  map: MapLibreMap | null | undefined,
  seaLevel: number,
  displacedPopText?: string,
  submergedCitiesCount?: number
): Promise<SnapshotExportResult> {
  // Safe render synchronization: trigger repaint and wait for render with timeout so it never hangs
  if (map && typeof map.triggerRepaint === 'function') {
    await new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };
      const timer = setTimeout(done, 120);
      try {
        if (typeof map.once === 'function') {
          map.once('render', done);
        }
        map.triggerRepaint();
      } catch {
        clearTimeout(timer);
        done();
      }
    });
  }

  // Retrieve MapLibre canvas element, with fallback to DOM query
  const mapCanvas = (map && typeof map.getCanvas === 'function' ? map.getCanvas() : null)
    || document.querySelector<HTMLCanvasElement>('canvas.maplibregl-canvas')
    || document.querySelector<HTMLCanvasElement>('canvas');

  if (!mapCanvas) {
    throw new Error('Map canvas element could not be retrieved.');
  }

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = mapCanvas.width;
  exportCanvas.height = mapCanvas.height;

  const ctx = exportCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D rendering context for export canvas.');
  }

  // Draw the full WebGL map canvas
  ctx.drawImage(mapCanvas, 0, 0);

  // Generate metadata and draw modern presentation overlay stamp
  const metadata = getSnapshotMetadata(seaLevel, displacedPopText, submergedCitiesCount);
  drawMetadataCard(ctx, exportCanvas.width, exportCanvas.height, metadata);

  const filename = formatSnapshotFilename(seaLevel, Date.now());

  // Convert to PNG blob, copy to clipboard (Ctrl+V ready), and trigger browser download
  return new Promise<SnapshotExportResult>((resolve, reject) => {
    exportCanvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('Failed to create PNG blob from export canvas.'));
        return;
      }

      let copiedToClipboard = false;

      // 1. Copy image directly to system clipboard for immediate Ctrl+V pasting
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
        try {
          const item = new ClipboardItem({ 'image/png': blob });
          await navigator.clipboard.write([item]);
          copiedToClipboard = true;
        } catch (clipErr) {
          console.warn('Clipboard image write not permitted or unsupported:', clipErr);
        }
      }

      // 2. Trigger browser file download
      try {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = filename;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        resolve({ copiedToClipboard, filename });
      } catch (err) {
        if (copiedToClipboard) {
          resolve({ copiedToClipboard: true, filename });
        } else {
          reject(err);
        }
      }
    }, 'image/png');
  });
}

// Alias for flexibility
export const exportMapSnapshot = captureMapSnapshot;

