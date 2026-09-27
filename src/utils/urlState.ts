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

  const parsedLevel = levelStr !== null ? parseFloat(levelStr) : null;
  const seaLevel = parsedLevel !== null && Number.isFinite(parsedLevel)
    ? Math.max(0, Math.min(1000, parsedLevel))
    : 0;

  // Validate and clamp Web Mercator latitude [-85.0511, 85.0511]
  const parsedLat = latStr !== null ? parseFloat(latStr) : null;
  const lat = parsedLat !== null && Number.isFinite(parsedLat)
    ? Math.max(-85.0511, Math.min(85.0511, parsedLat))
    : null;

  // Validate and clamp longitude [-180, 180]
  const parsedLon = lonStr !== null ? parseFloat(lonStr) : null;
  const lon = parsedLon !== null && Number.isFinite(parsedLon)
    ? Math.max(-180, Math.min(180, parsedLon))
    : null;

  // Validate and clamp zoom level [0, 22]
  const parsedZoom = zoomStr !== null ? parseFloat(zoomStr) : null;
  const zoom = parsedZoom !== null && Number.isFinite(parsedZoom)
    ? Math.max(0, Math.min(22, parsedZoom))
    : null;

  const tab: 'cities' | 'landmarks' | 'countries' =
    tabStr === 'landmarks' || tabStr === 'countries' ? tabStr : 'cities';

  return { seaLevel, lat, lon, zoom, tab };
}
