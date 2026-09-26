import { ProbeStatus } from '../types';
import { decodeTerrariumPixel, fetchAndDecodeDemTile } from './demProcessor';
import { findProtectedBasin, isBasinBreached } from './basinProtection';

/**
 * Converts geographic coordinates (lon, lat) to Web Mercator tile index and pixel position.
 */
export function lonLatToTilePixel(
  lon: number,
  lat: number,
  zoom: number
): { z: number; x: number; y: number; px: number; py: number } {
  // Clamp latitude to Mercator bounds [-85.051129, 85.051129]
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));

  // Normalize longitude to [-180, 180)
  const normLon = ((((lon + 180) % 360) + 360) % 360) - 180;

  const n = 1 << zoom;
  const rawX = ((normLon + 180) / 360) * n;

  const latRad = (clampedLat * Math.PI) / 180;
  const mercatorY = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;
  const rawY = mercatorY * n;

  const x = Math.max(0, Math.min(n - 1, Math.floor(rawX)));
  const y = Math.max(0, Math.min(n - 1, Math.floor(rawY)));

  const px = Math.max(0, Math.min(255, Math.floor((rawX - x) * 256)));
  const py = Math.max(0, Math.min(255, Math.floor((rawY - y) * 256)));

  return { z: zoom, x, y, px, py };
}

/**
 * Samples and decodes ground elevation (in meters) from AWS Terrarium DEM tiles.
 */
export async function sampleElevationAt(
  lon: number,
  lat: number,
  mapZoom: number = 6
): Promise<number> {
  const sampleZoom = Math.min(Math.max(Math.floor(mapZoom), 6), 11);
  const { z, x, y, px, py } = lonLatToTilePixel(lon, lat, sampleZoom);

  const imageData = await fetchAndDecodeDemTile(z, x, y);
  const idx = (py * imageData.width + px) * 4;
  const r = imageData.data[idx];
  const g = imageData.data[idx + 1];
  const b = imageData.data[idx + 2];

  const elevation = decodeTerrariumPixel(r, g, b);
  return parseFloat(elevation.toFixed(1));
}

/**
 * Evaluates the inundation status and depth/clearance of a ground elevation at a given sea level.
 * Takes into account natural mountain sills protecting landlocked inland basins.
 */
export function getProbeStatus(
  elevation: number,
  seaLevel: number,
  coords?: { lat: number; lon: number }
): ProbeStatus {
  // Check if point lies within a protected inland basin
  if (coords) {
    const basin = findProtectedBasin(coords.lon, coords.lat);
    if (basin) {
      const isBreached = isBasinBreached(basin, seaLevel);
      if (!isBreached) {
        return {
          elevation,
          isSubmerged: false,
          isDepression: elevation <= 0,
          isSafe: true,
          waterDepth: 0,
          clearance: Math.max(0, parseFloat((basin.sillElevationMeters - seaLevel).toFixed(1))),
          statusText: `Natural Basin Protected — Ocean blocked by sill (+${basin.sillElevationMeters}m threshold)`,
          badgeType: 'basin_protected',
          isBasinProtected: true,
          sillElevation: basin.sillElevationMeters
        };
      } else {
        // Basin breached by sea level overflow!
        if (elevation <= seaLevel) {
          const waterDepth = parseFloat((seaLevel - elevation).toFixed(1));
          return {
            elevation,
            isSubmerged: true,
            isDepression: false,
            isSafe: false,
            waterDepth,
            clearance: 0,
            statusText: `Basin Sill Breached (+${basin.sillElevationMeters}m) — Submerged under ${waterDepth}m water`,
            badgeType: 'submerged',
            isBasinProtected: false,
            sillElevation: basin.sillElevationMeters
          };
        }
      }
    }
  }

  // Below-sea-level dry depressions (e.g. Death Valley, Amsterdam polders)
  if (elevation <= 0) {
    return {
      elevation,
      isSubmerged: false,
      isDepression: true,
      isSafe: false,
      waterDepth: 0,
      clearance: 0,
      statusText: `Below sea level today (${elevation > 0 ? `+${elevation}m` : `${elevation}m`})`,
      badgeType: 'depression'
    };
  }

  // Sea level at 0m (baseline)
  if (seaLevel <= 0) {
    return {
      elevation,
      isSubmerged: false,
      isDepression: false,
      isSafe: true,
      waterDepth: 0,
      clearance: elevation,
      statusText: `Safe — ${elevation}m above sea level`,
      badgeType: 'safe'
    };
  }

  // If elevation is below or equal to rising sea level
  if (elevation <= seaLevel) {
    const waterDepth = parseFloat((seaLevel - elevation).toFixed(1));
    return {
      elevation,
      isSubmerged: true,
      isDepression: false,
      isSafe: false,
      waterDepth,
      clearance: 0,
      statusText: `Submerged under ${waterDepth}m of water`,
      badgeType: 'submerged'
    };
  }

  // Land remains above rising sea level
  const clearance = parseFloat((elevation - seaLevel).toFixed(1));
  return {
    elevation,
    isSubmerged: false,
    isDepression: false,
    isSafe: true,
    waterDepth: 0,
    clearance,
    statusText: `Safe — ${clearance}m clearance above water`,
    badgeType: 'safe'
  };
}

/**
 * Formats latitude and longitude coordinates into a human-readable string.
 */
export function formatCoordinates(lat: number, lon: number): string {
  const latStr = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}`;
  return `${latStr}, ${lonStr}`;
}
