import rawProtectedBasins from '../data/protectedBasins.json';
import { ProtectedBasin } from '../types';

export const PROTECTED_BASINS: ProtectedBasin[] = rawProtectedBasins as ProtectedBasin[];

/**
 * Finds the protected inland basin that contains the given coordinates, if any.
 */
export function findProtectedBasin(lon: number, lat: number): ProtectedBasin | null {
  for (const basin of PROTECTED_BASINS) {
    const { minLat, maxLat, minLon, maxLon } = basin.bounds;
    if (lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) {
      return basin;
    }
  }
  return null;
}

/**
 * Returns true if hypothetical sea level has reached or exceeded the basin's mountain sill threshold.
 */
export function isBasinBreached(basin: ProtectedBasin, seaLevel: number): boolean {
  return seaLevel >= basin.sillElevationMeters;
}

/**
 * Returns true if coordinates are located inside a protected inland basin whose natural barrier has NOT been breached.
 */
export function isCoordProtectedFromOcean(lon: number, lat: number, seaLevel: number): boolean {
  const basin = findProtectedBasin(lon, lat);
  if (!basin) return false;
  return !isBasinBreached(basin, seaLevel);
}

/**
 * Returns all basins whose mountain sill has NOT been breached at the current sea level.
 */
export function getUnbreachedBasins(seaLevel: number): ProtectedBasin[] {
  return PROTECTED_BASINS.filter((b) => seaLevel < b.sillElevationMeters);
}

/**
 * Checks whether an axis-aligned bounding box (such as a Web Mercator tile) intersects a protected basin.
 */
export function tileIntersectsBasin(
  tileBounds: { minLat: number; maxLat: number; minLon: number; maxLon: number },
  basin: ProtectedBasin
): boolean {
  return !(
    tileBounds.maxLat < basin.bounds.minLat ||
    tileBounds.minLat > basin.bounds.maxLat ||
    tileBounds.maxLon < basin.bounds.minLon ||
    tileBounds.minLon > basin.bounds.maxLon
  );
}

/**
 * Checks whether an axis-aligned tile is entirely enclosed inside a protected basin.
 */
export function isTileFullyInsideBasin(
  tileBounds: { minLat: number; maxLat: number; minLon: number; maxLon: number },
  basin: ProtectedBasin
): boolean {
  return (
    tileBounds.minLat >= basin.bounds.minLat &&
    tileBounds.maxLat <= basin.bounds.maxLat &&
    tileBounds.minLon >= basin.bounds.minLon &&
    tileBounds.maxLon <= basin.bounds.maxLon
  );
}

/**
 * Calculates geographic lat/lon bounding box for a given Web Mercator tile (z, x, y).
 */
export function tileToLatLonBounds(
  z: number,
  x: number,
  y: number
): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
  const n = 1 << z;
  const minLon = (x / n) * 360 - 180;
  const maxLon = ((x + 1) / n) * 360 - 180;

  const n1 = Math.PI - (2 * Math.PI * y) / n;
  const maxLat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n1) - Math.exp(-n1)));

  const n2 = Math.PI - (2 * Math.PI * (y + 1)) / n;
  const minLat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n2) - Math.exp(-n2)));

  return { minLat, maxLat, minLon, maxLon };
}

