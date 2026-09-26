export interface ScenarioParams {
  seaLevel: number;
  lat: number | null;
  lon: number | null;
  zoom: number | null;
  tab: 'cities' | 'landmarks' | 'countries';
}

/**
 * Serializes sea level, camera viewport, and active tab into a URL query string.
 */
export function serializeScenarioParams(
  seaLevel: number,
  viewport: { lat: number; lon: number; zoom: number } | null,
  tab: 'cities' | 'landmarks' | 'countries' = 'cities'
): string {
  const params = new URLSearchParams();

  if (seaLevel > 0) {
    const formattedLevel = seaLevel % 1 !== 0 ? seaLevel.toFixed(1) : seaLevel.toString();
    params.set('level', formattedLevel);
  }

  if (viewport) {
    params.set('lat', viewport.lat.toFixed(4));
    params.set('lon', viewport.lon.toFixed(4));
    params.set('zoom', viewport.zoom.toFixed(2));
  }

  if (tab && tab !== 'cities') {
    params.set('tab', tab);
  }

  return params.toString();
}

/**
 * Parses scenario parameters from a URL query string (window.location.search).
 */
export function parseScenarioParams(search: string): ScenarioParams {
  const params = new URLSearchParams(search);
  const levelStr = params.get('level');
  const latStr = params.get('lat');
  const lonStr = params.get('lon');
  const zoomStr = params.get('zoom');
  const tabStr = params.get('tab');

  const seaLevel = levelStr !== null && !isNaN(parseFloat(levelStr))
    ? Math.max(0, Math.min(1000, parseFloat(levelStr)))
    : 0;

  const lat = latStr !== null && !isNaN(parseFloat(latStr)) ? parseFloat(latStr) : null;
  const lon = lonStr !== null && !isNaN(parseFloat(lonStr)) ? parseFloat(lonStr) : null;
  const zoom = zoomStr !== null && !isNaN(parseFloat(zoomStr)) ? parseFloat(zoomStr) : null;

  const tab: 'cities' | 'landmarks' | 'countries' =
    tabStr === 'landmarks' || tabStr === 'countries' ? tabStr : 'cities';

  return { seaLevel, lat, lon, zoom, tab };
}
