/**
 * Global Sea Level Explorer - Elevation Decoding & DEM Processor
 *
 * Official Mapzen Terrarium Format:
 * elevation (meters) = (R * 256.0 + G + B / 256.0) - 32768.0
 * where R, G, B are 8-bit integer channel values [0, 255].
 *
 * MVP Model Definition:
 * - "+X meters" = hypothetical global ocean sea-level elevation X meters above today's mean sea level (0m).
 * - Only currently dry land above today's sea level (0 < elevation <= seaLevel) is classified as newly submerged.
 * - Naturally dry depressions below today's sea level (elevation <= 0) are NOT classified as newly submerged.
 * - Existing ocean/water (elevation <= 0) is NOT classified as newly submerged.
 * - At 0m sea level, exactly 0 newly submerged land is visualized.
 */

import rawCitiesData from '../data/cities.json';
import rawGlobalPopData from '../data/globalPopulationImpact.json';
import rawLandmarksData from '../data/landmarks.json';
import rawCountriesData from '../data/countriesImpact.json';
import rawFactsData from '../data/didYouKnowFacts.json';
import { City, PopulationImpact, Landmark, CountryImpact, DidYouKnowFact } from '../types';
import { getCountryImpactStats } from './countryImpactUtils';
import {
  PROTECTED_BASINS,
  findProtectedBasin,
  getUnbreachedBasins,
  tileIntersectsBasin,
  isTileFullyInsideBasin,
  isBasinBreached,
  tileToLatLonBounds
} from './basinProtection';
import { serializeScenarioParams, parseScenarioParams } from './urlState';
import { formatSnapshotFilename, getSnapshotMetadata } from './snapshotExporter';

const citiesData: City[] = rawCitiesData as City[];
const globalPopData: PopulationImpact[] = rawGlobalPopData as PopulationImpact[];
const landmarksData: Landmark[] = rawLandmarksData as Landmark[];
const countriesData: CountryImpact[] = rawCountriesData as CountryImpact[];
const factsData: DidYouKnowFact[] = rawFactsData as DidYouKnowFact[];

export function decodeTerrariumPixel(r: number, g: number, b: number): number {
  return (r * 256.0 + g + b / 256.0) - 32768.0;
}

export function encodeTerrariumPixel(elevation: number): [number, number, number] {
  const val = Math.round((elevation + 32768.0) * 256.0);
  const clamped = Math.max(0, Math.min(16777215, val));
  const r = Math.floor(clamped / 65536);
  const g = Math.floor((clamped % 65536) / 256);
  const b = clamped % 256;
  return [r, g, b];
}

// Sub-decimeter noise floor: In Terrarium raster tiles, resampling interpolation
// between land and 0m sea level produces sub-centimeter artifacts (e.g. 0.004m to 0.05m)
// in open water. Setting a 0.1m (10cm) threshold eliminates false marine halos while
// preserving true 1m+ sea-level rise inundation.
export const MIN_LAND_ELEVATION_THRESHOLD = 0.1;

/**
 * Core inundation rule for MVP.
 * Returns true ONLY for land that is currently dry and above today's mean sea level,
 * but would be covered if sea level rose by `seaLevel` meters.
 */
export function isNewlySubmerged(elevation: number, seaLevel: number): boolean {
  if (seaLevel <= 0) return false;
  return elevation >= MIN_LAND_ELEVATION_THRESHOLD && elevation <= seaLevel;
}

// In-memory cache for raw decoded DEM pixel data (key: `${z}/${x}/${y}`)
// This allows instantaneous re-filtering without re-fetching or re-decoding PNGs from network.
const rawDemCache = new Map<string, ImageData>();

export async function fetchAndDecodeDemTile(z: number, x: number, y: number): Promise<ImageData> {
  const key = `${z}/${x}/${y}`;
  const cached = rawDemCache.get(key);
  if (cached) return cached;

  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) {
    throw new Error(`Failed to fetch DEM tile ${key}: HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);

  // Draw to offscreen canvas to obtain raw pixel data
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const rawData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

  // Cache up to 250 visible/recent tiles in memory
  if (rawDemCache.size > 250) {
    const firstKey = rawDemCache.keys().next().value;
    if (firstKey) rawDemCache.delete(firstKey);
  }
  rawDemCache.set(key, rawData);
  return rawData;
}

/**
 * Generates an RGBA image bitmap where newly submerged pixels are tinted with flood water color.
 * Preserves protected inland basins until hypothetical sea level breaches their natural sill elevation.
 */
export async function generateSubmergedTile(
  z: number,
  x: number,
  y: number,
  seaLevel: number
): Promise<ImageBitmap> {
  const rawData = await fetchAndDecodeDemTile(z, x, y);
  const width = rawData.width;
  const height = rawData.height;
  const src = rawData.data;

  const outCanvas = new OffscreenCanvas(width, height);
  const outCtx = outCanvas.getContext('2d')!;
  const outData = outCtx.createImageData(width, height);
  const dst = outData.data;

  if (seaLevel > 0) {
    const tileBounds = tileToLatLonBounds(z, x, y);
    const unbreachedBasins = getUnbreachedBasins(seaLevel);
    const intersectingUnbreached = unbreachedBasins.filter((b) => tileIntersectsBasin(tileBounds, b));

    // If tile is 100% enclosed within an unbreached basin, entire tile remains protected and dry
    if (intersectingUnbreached.length > 0 && intersectingUnbreached.some((b) => isTileFullyInsideBasin(tileBounds, b))) {
      outCtx.putImageData(outData, 0, 0);
      return createImageBitmap(outCanvas);
    }

    const breachedBasins = PROTECTED_BASINS.filter(
      (b) => isBasinBreached(b, seaLevel) && tileIntersectsBasin(tileBounds, b)
    );

    const hasBasinInteractions = intersectingUnbreached.length > 0 || breachedBasins.length > 0;

    let latLUT: Float64Array | null = null;
    let lonLUT: Float64Array | null = null;

    if (hasBasinInteractions) {
      const n = 1 << z;
      latLUT = new Float64Array(height);
      for (let py = 0; py < height; py++) {
        const nPix = Math.PI - (2 * Math.PI * (y + (py + 0.5) / height)) / n;
        latLUT[py] = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(nPix) - Math.exp(-nPix)));
      }
      lonLUT = new Float64Array(width);
      for (let px = 0; px < width; px++) {
        lonLUT[px] = tileBounds.minLon + ((px + 0.5) / width) * (tileBounds.maxLon - tileBounds.minLon);
      }
    }

    for (let py = 0; py < height; py++) {
      const pLat = latLUT ? latLUT[py] : 0;
      const rowOffset = py * width * 4;

      for (let px = 0; px < width; px++) {
        const i = rowOffset + px * 4;
        const r = src[i];
        const g = src[i + 1];
        const b = src[i + 2];
        const elevation = (r * 256.0 + g + b / 256.0) - 32768.0;

        if (hasBasinInteractions && latLUT && lonLUT) {
          const pLon = lonLUT[px];

          // Check if pixel is inside an unbreached basin (mountain sill blocks ocean)
          let isProtected = false;
          for (let b = 0; b < intersectingUnbreached.length; b++) {
            const bounds = intersectingUnbreached[b].bounds;
            if (pLat >= bounds.minLat && pLat <= bounds.maxLat && pLon >= bounds.minLon && pLon <= bounds.maxLon) {
              isProtected = true;
              break;
            }
          }

          if (isProtected) {
            dst[i + 3] = 0;
            continue;
          }

          // Check if pixel is inside a breached basin
          let inBreachedBasin = false;
          for (let b = 0; b < breachedBasins.length; b++) {
            const bounds = breachedBasins[b].bounds;
            if (pLat >= bounds.minLat && pLat <= bounds.maxLat && pLon >= bounds.minLon && pLon <= bounds.maxLon) {
              inBreachedBasin = true;
              break;
            }
          }

          const shouldFlood = inBreachedBasin ? (elevation <= seaLevel) : isNewlySubmerged(elevation, seaLevel);

          if (shouldFlood) {
            dst[i] = 2;       // Red
            dst[i + 1] = 132; // Green
            dst[i + 2] = 199; // Blue
            dst[i + 3] = 175; // Alpha
          } else {
            dst[i + 3] = 0;
          }
        } else {
          // Standard fast path for tiles outside inland basins
          if (isNewlySubmerged(elevation, seaLevel)) {
            dst[i] = 2;
            dst[i + 1] = 132;
            dst[i + 2] = 199;
            dst[i + 3] = 175;
          } else {
            dst[i + 3] = 0;
          }
        }
      }
    }
  }

  outCtx.putImageData(outData, 0, 0);
  return createImageBitmap(outCanvas);
}

export interface SanityCheckResult {
  passed: boolean;
  checks: { name: string; expected: boolean; actual: boolean; detail: string }[];
}

/**
 * Sanity check test suite confirming that:
 * 1. Naturally dry land below sea level (e.g. Dead Sea, Baku, Death Valley, Amsterdam) is NOT marked as newly flooded.
 * 2. At 0m sea level, exactly 0 points are marked as newly flooded.
 * 3. Elevated points above sea level are NOT marked as newly flooded.
 * 4. Land between 0m and +X m IS marked as newly flooded.
 * 5. Terrarium encoding/decoding arithmetic is exact.
 */
export function runSanityCheck(): SanityCheckResult {
  const checks = [
    {
      name: "Dead Sea (-430m) at +10m sea level",
      expected: false,
      actual: isNewlySubmerged(-430, 10),
      detail: "Dry depression below sea level must never be classified as newly submerged."
    },
    {
      name: "Death Valley (-58m) at +50m sea level",
      expected: false,
      actual: isNewlySubmerged(-58, 50),
      detail: "Dry depression below sea level must not be marked newly flooded."
    },
    {
      name: "Baku Caspian coast (-28m) at +1m sea level",
      expected: false,
      actual: isNewlySubmerged(-28, 1),
      detail: "Caspian depression land must not be marked newly flooded."
    },
    {
      name: "Sub-decimeter marine noise (+0.004m / 4mm) at +1m sea level",
      expected: false,
      actual: isNewlySubmerged(0.004, 1),
      detail: "Millimeter-scale marine interpolation artifacts must not be classified as newly submerged."
    },
    {
      name: "Amsterdam polder (-2m) at +0m sea level",
      expected: false,
      actual: isNewlySubmerged(-2, 0),
      detail: "At 0m sea level, below-zero land must not be marked newly flooded."
    },
    {
      name: "Miami coastal point (+2m) at +0m sea level",
      expected: false,
      actual: isNewlySubmerged(2, 0),
      detail: "At 0m sea level, no positive elevation land is newly flooded."
    },
    {
      name: "Miami coastal point (+2m) at +1m sea level",
      expected: false,
      actual: isNewlySubmerged(2, 1),
      detail: "Land higher than hypothetical sea level remains above water."
    },
    {
      name: "Miami coastal point (+2m) at +2m sea level",
      expected: true,
      actual: isNewlySubmerged(2, 2),
      detail: "Land equal to hypothetical sea level is newly submerged."
    },
    {
      name: "Miami coastal point (+2m) at +5m sea level",
      expected: true,
      actual: isNewlySubmerged(2, 5),
      detail: "Land below hypothetical sea level (and >0m) is newly submerged."
    },
    {
      name: "Denver high ground (+1609m) at +100m sea level",
      expected: false,
      actual: isNewlySubmerged(1609, 100),
      detail: "High terrain remains completely unaffected."
    },
    {
      name: "Madrid (+667m) at +500m extreme sea level",
      expected: false,
      actual: isNewlySubmerged(667, 500),
      detail: "Inland plateau city at 667m remains above water at +500m."
    },
    {
      name: "Madrid (+667m) at +700m extreme sea level",
      expected: true,
      actual: isNewlySubmerged(667, 700),
      detail: "Inland plateau city at 667m becomes submerged once sea level reaches +700m."
    },
    {
      name: "Denver (+1609m) at +1000m deluge sea level",
      expected: false,
      actual: isNewlySubmerged(1609, 1000),
      detail: "Mile High City remains safe even under a hypothetical +1,000m deluge."
    }
  ];

  // Round-trip encoding verification
  const testElevations = [0, 1.5, 10, 50, 8848, -430];
  let roundTripOk = true;
  for (const e of testElevations) {
    const [r, g, b] = encodeTerrariumPixel(e);
    const decoded = decodeTerrariumPixel(r, g, b);
    if (Math.abs(decoded - e) > 0.01) {
      roundTripOk = false;
      break;
    }
  }

  checks.push({
    name: "Terrarium RGB formula round-trip arithmetic",
    expected: true,
    actual: roundTripOk,
    detail: "Precision within ±0.01 meters across test range [-430m, 8848m]."
  });

  const allCitiesHavePop = citiesData.length > 0 && citiesData.every(c =>
    typeof c.population === 'number' &&
    Number.isInteger(c.population) &&
    c.population > 0
  );

  checks.push({
    name: `Tracked cities population enrichment (${citiesData.length} cities)`,
    expected: true,
    actual: allCitiesHavePop && citiesData.length >= 500,
    detail: "All tracked cities must have a valid positive integer population, and dataset must contain 500+ cities."
  });

  const allCitiesHaveTier = citiesData.every(c => c.tier && [1, 2, 3].includes(c.tier));
  checks.push({
    name: "Cities zoom-tiering classification (tiers 1, 2, 3)",
    expected: true,
    actual: allCitiesHaveTier,
    detail: "Every city must be assigned a zoom tier (1: mega/capital, 2: major hub, 3: regional)."
  });

  const globalPopValid = (
    Array.isArray(globalPopData) &&
    globalPopData.length === 1001 &&
    globalPopData[0].elevation === 0 &&
    globalPopData[0].population === 0 &&
    globalPopData[0].percentage === 0 &&
    globalPopData.every((item, idx) => {
      if (idx === 0) return true;
      const prev = globalPopData[idx - 1];
      return item.elevation === idx && item.population >= prev.population;
    })
  );

  checks.push({
    name: "Global population hypsographic curve (0m-1,000m)",
    expected: true,
    actual: globalPopValid,
    detail: "Curve must span 0m to 1,000m, strictly monotonic, with exactly 0 displaced at 0m."
  });

  const validCategories = new Set(['heritage', 'monument', 'natural', 'structure']);
  const landmarksValid = (
    Array.isArray(landmarksData) &&
    landmarksData.length >= 40 &&
    landmarksData.every(l =>
      typeof l.id === 'string' &&
      typeof l.name === 'string' &&
      validCategories.has(l.category) &&
      typeof l.country === 'string' &&
      typeof l.lat === 'number' && l.lat >= -90 && l.lat <= 90 &&
      typeof l.lon === 'number' && l.lon >= -180 && l.lon <= 180 &&
      typeof l.elevation === 'number' &&
      typeof l.description === 'string' && l.description.length > 0
    )
  );

  checks.push({
    name: `Iconic global landmarks dataset (${landmarksData.length} landmarks)`,
    expected: true,
    actual: landmarksValid,
    detail: "All landmarks must have valid category ('heritage'|'monument'|'natural'|'structure'), coordinates, and elevation."
  });

  // National Inundation Dataset & Island Submersion Verification
  const countriesValid = (
    Array.isArray(countriesData) &&
    countriesData.length >= 60 &&
    countriesData.every(c =>
      typeof c.id === 'string' && c.id.length === 3 &&
      typeof c.name === 'string' &&
      typeof c.flag === 'string' &&
      typeof c.region === 'string' &&
      typeof c.totalPopulation === 'number' && c.totalPopulation > 0 &&
      typeof c.totalAreaKm2 === 'number' && c.totalAreaKm2 > 0 &&
      typeof c.maxElevation === 'number' && c.maxElevation > 0 &&
      typeof c.lat === 'number' &&
      typeof c.lon === 'number' &&
      typeof c.isIslandNation === 'boolean' &&
      Array.isArray(c.landSubmergedCurve) && c.landSubmergedCurve.length >= 8 &&
      Array.isArray(c.popDisplacedCurve) && c.popDisplacedCurve.length >= 8
    )
  );

  checks.push({
    name: `National inundation dataset (${countriesData.length} sovereign nations)`,
    expected: true,
    actual: countriesValid,
    detail: "All sovereign nations must have ISO alpha-3 codes, valid hypsometric curves, and max elevations."
  });

  const maldives = countriesData.find(c => c.id === 'MDV');
  const tuvalu = countriesData.find(c => c.id === 'TUV');
  const netherlands = countriesData.find(c => c.id === 'NLD');

  const maldivesAt5m = maldives ? getCountryImpactStats(maldives, 5) : null;
  checks.push({
    name: "Maldives (max peak 2.4m) at +5m sea level: 100% submerged",
    expected: true,
    actual: maldivesAt5m ? (maldivesAt5m.isFullySubmerged && maldivesAt5m.landSubmergedPct === 100) : false,
    detail: "Low-lying atoll nation must be detected as 100% submerged when sea level exceeds max natural elevation."
  });

  const tuvaluAt1m = tuvalu ? getCountryImpactStats(tuvalu, 1) : null;
  checks.push({
    name: "Tuvalu (max peak 4.6m) at +1m sea level: NOT 100% submerged",
    expected: false,
    actual: tuvaluAt1m ? tuvaluAt1m.isFullySubmerged : true,
    detail: "Tuvalu peak (4.6m) exceeds +1m sea level, so nation is NOT 100% underwater."
  });

  const tuvaluAt5m = tuvalu ? getCountryImpactStats(tuvalu, 5) : null;
  checks.push({
    name: "Tuvalu (max peak 4.6m) at +5m sea level: 100% submerged",
    expected: true,
    actual: tuvaluAt5m ? tuvaluAt5m.isFullySubmerged : false,
    detail: "Tuvalu peak is submerged under +5m sea level, triggering existential 100% submersion alert."
  });

  const netherlandsAt10m = netherlands ? getCountryImpactStats(netherlands, 10) : null;
  checks.push({
    name: "Netherlands (Vaalserberg peak 322m) at +10m: NOT 100% submerged",
    expected: false,
    actual: netherlandsAt10m ? netherlandsAt10m.isFullySubmerged : true,
    detail: "Netherlands has extensive lowlands but high eastern hills (322m), so is NOT 100% submerged at +10m."
  });

  // Elevation Probe Web Mercator & Status Verification
  function calcLonLatToTilePixel(lon: number, lat: number, zoom: number) {
    const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
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

  function calcProbeStatus(elevation: number, seaLevel: number) {
    if (elevation <= 0) {
      return { isSubmerged: false, isDepression: true, isSafe: false, waterDepth: 0, clearance: 0 };
    }
    if (seaLevel <= 0) {
      return { isSubmerged: false, isDepression: false, isSafe: true, waterDepth: 0, clearance: elevation };
    }
    if (elevation <= seaLevel) {
      const waterDepth = parseFloat((seaLevel - elevation).toFixed(1));
      return { isSubmerged: true, isDepression: false, isSafe: false, waterDepth, clearance: 0 };
    }
    const clearance = parseFloat((elevation - seaLevel).toFixed(1));
    return { isSubmerged: false, isDepression: false, isSafe: true, waterDepth: 0, clearance };
  }

  const probeTile0 = calcLonLatToTilePixel(0, 0, 0);
  checks.push({
    name: "Web Mercator tile conversion: (0, 0) at zoom 0 -> tile (0, 0), pixel (128, 128)",
    expected: true,
    actual: probeTile0.x === 0 && probeTile0.y === 0 && probeTile0.px === 128 && probeTile0.py === 128,
    detail: "Origin coordinate (0, 0) must precisely map to the center pixel of root tile (0, 0)."
  });

  const probeSubmerged = calcProbeStatus(12.5, 20);
  checks.push({
    name: "Probe flood depth: elevation +12.5m at sea level +20m -> 7.5m water depth",
    expected: true,
    actual: probeSubmerged.isSubmerged && probeSubmerged.waterDepth === 7.5,
    detail: "Ground below sea level must report submerged status with exact depth of water column."
  });

  const probeSafe = calcProbeStatus(45, 10);
  checks.push({
    name: "Probe clearance: elevation +45m at sea level +10m -> 35m clearance",
    expected: true,
    actual: probeSafe.isSafe && probeSafe.clearance === 35,
    detail: "Ground above sea level must report safe status with exact elevation clearance."
  });

  const probeDepression = calcProbeStatus(-50, 10);
  checks.push({
    name: "Probe natural depression: elevation -50m at sea level +10m -> depression",
    expected: true,
    actual: probeDepression.isDepression && !probeDepression.isSubmerged,
    detail: "Naturally dry depression land below sea level must be preserved and classified as depression."
  });

  // Protected Inland Basins Verification
  const jordanBasin = findProtectedBasin(35.5, 31.5);
  checks.push({
    name: "Jordan Rift & Dead Sea Basin at +10m: Protected (sill 35m)",
    expected: false,
    actual: jordanBasin ? isBasinBreached(jordanBasin, 10) : true,
    detail: "Jordan Rift basin must remain protected from ocean inundation below its 35m Jezreel sill."
  });

  checks.push({
    name: "Jordan Rift & Dead Sea Basin at +40m: Breached! (sill 35m)",
    expected: true,
    actual: jordanBasin ? isBasinBreached(jordanBasin, 40) : false,
    detail: "Sea level exceeding 35m must trigger Mediterranean ingress breach into Jordan Rift."
  });

  const qattaraBasin = findProtectedBasin(27.5, 30.0);
  checks.push({
    name: "Qattara Depression at +20m: Protected (sill 55m)",
    expected: false,
    actual: qattaraBasin ? isBasinBreached(qattaraBasin, 20) : true,
    detail: "Qattara Depression must stay dry from ocean floodwaters below its 55m northern sill."
  });

  checks.push({
    name: "Qattara Depression at +60m: Breached! (sill 55m)",
    expected: true,
    actual: qattaraBasin ? isBasinBreached(qattaraBasin, 60) : false,
    detail: "Sea level at +60m breaches the northern Mediterranean ridge (55m), flooding Qattara."
  });

  const saltonBasin = findProtectedBasin(-115.8, 33.3);
  checks.push({
    name: "Salton Sink at +5m: Protected (sill 12m)",
    expected: false,
    actual: saltonBasin ? isBasinBreached(saltonBasin, 5) : true,
    detail: "Salton Sink must be protected from Gulf of California waters below its 12m Colorado delta sill."
  });

  checks.push({
    name: "Salton Sink at +15m: Breached! (sill 12m)",
    expected: true,
    actual: saltonBasin ? isBasinBreached(saltonBasin, 15) : false,
    detail: "Sea level at +15m breaches the 12m sill and floods the Salton Sink basin."
  });

  // URL Scenario Parameter Serializer / Parser Round-Trip
  const testQuery = serializeScenarioParams(45, { lat: 31.7683, lon: 35.2137, zoom: 8.5 }, 'countries');
  const parsedQuery = parseScenarioParams(testQuery);
  checks.push({
    name: "URL scenario parameter serializer round-trip",
    expected: true,
    actual: parsedQuery.seaLevel === 45 && parsedQuery.lat !== null && Math.abs(parsedQuery.lat - 31.7683) < 0.0001 && parsedQuery.lon !== null && Math.abs(parsedQuery.lon - 35.2137) < 0.0001 && parsedQuery.zoom === 8.5 && parsedQuery.tab === 'countries',
    detail: "Scenario URL parameters (level, lat, lon, zoom, tab) must serialize and deserialize faithfully."
  });

  // Map Snapshot Exporter Verification
  checks.push({
    name: "Snapshot filename formatting (0m and +15m)",
    expected: true,
    actual: formatSnapshotFilename(15) === "sea-level-explorer-plus-15m.png" &&
            formatSnapshotFilename(0) === "sea-level-explorer-0m.png" &&
            formatSnapshotFilename(15, 1700000000000) === "sea-level-explorer-plus-15m-1700000000000.png",
    detail: "Filenames must follow standard pattern with or without millisecond timestamp."
  });

  const meta0m = getSnapshotMetadata(0);
  checks.push({
    name: "Snapshot presentation metadata: 0m baseline",
    expected: true,
    actual: meta0m.title === "Global Sea Level Explorer" &&
            meta0m.badgeText.includes("0m") &&
            meta0m.impactText.includes("0 Displaced") &&
            meta0m.attribution.includes("CARTO"),
    detail: "0m baseline snapshot must display zero displaced population and proper attribution."
  });

  const meta10m = getSnapshotMetadata(10, undefined, 42);
  checks.push({
    name: "Snapshot presentation metadata: +10m coastal threshold",
    expected: true,
    actual: meta10m.badgeText.includes("+10m") &&
            meta10m.impactText.includes("640M") &&
            meta10m.submergedCitiesText === "42 Tracked Cities Submerged",
    detail: "Metadata overlay at +10m must reflect ~640M displaced population and tracked cities count."
  });

  const meta1000m = getSnapshotMetadata(1000);
  checks.push({
    name: "Snapshot presentation metadata: +1,000m deluge scale",
    expected: true,
    actual: meta1000m.badgeText.includes("+1000m") &&
            meta1000m.impactText.includes("7.1B") &&
            meta1000m.impactText.includes("88.2%"),
    detail: "Deluge metadata at +1,000m must reflect 7.1B displaced (88.2% of global population)."
  });

  // Did You Know Facts Verification
  const validFactCategories = new Set(['geography', 'population', 'economy', 'history', 'heritage', 'deluge']);
  const factsValid = (
    Array.isArray(factsData) &&
    factsData.length >= 50 &&
    factsData.every(f =>
      typeof f.id === 'string' && f.id.length > 0 &&
      typeof f.category === 'string' && validFactCategories.has(f.category) &&
      typeof f.title === 'string' && f.title.length > 0 &&
      typeof f.fact === 'string' && f.fact.length > 0 &&
      Array.isArray(f.tags) && f.tags.length > 0 &&
      (f.highlightLevel === undefined || typeof f.highlightLevel === 'number')
    )
  );

  checks.push({
    name: `Did You Know? insights knowledge base (${factsData.length} facts)`,
    expected: true,
    actual: factsValid,
    detail: "Dataset must contain 50+ rich facts across geography, population, economy, history, heritage, and deluge."
  });

  const factsHaveKeyMilestones = [1, 66, 1000].every(lvl =>
    factsData.some(f => f.highlightLevel === lvl)
  );

  checks.push({
    name: "Did You Know? key milestone triggers (+1m, +66m, +1,000m)",
    expected: true,
    actual: factsHaveKeyMilestones,
    detail: "Key climate and deluge elevation milestones must map to relevant contextual facts."
  });

  // Country Sorting (Displaced Population vs Land Flooded) Verification
  const countriesAt2m = countriesData.map(c => {
    const stats = getCountryImpactStats(c, 2);
    return {
      ...stats,
      country: c,
      displacedPopulation: Math.round(c.totalPopulation * (stats.popDisplacedPct / 100))
    };
  });

  const sortedByPop = [...countriesAt2m].sort((a, b) => {
    if (a.isFullySubmerged !== b.isFullySubmerged) return a.isFullySubmerged ? -1 : 1;
    return b.displacedPopulation - a.displacedPopulation;
  });

  const sortedByLand = [...countriesAt2m].sort((a, b) => {
    if (a.isFullySubmerged !== b.isFullySubmerged) return a.isFullySubmerged ? -1 : 1;
    return b.landSubmergedPct - a.landSubmergedPct;
  });

  const topPopIsHumanitarianDelta = sortedByPop.slice(0, 3).some(c => ['CHN', 'BGD', 'IND', 'VNM'].includes(c.country.id));
  const topLandIsLowLyingOrAtoll = sortedByLand.slice(0, 3).some(c => ['MDV', 'TUV', 'KIR', 'MHL', 'BHS'].includes(c.country.id));

  checks.push({
    name: "Country impact dual-sorting: Displaced Population vs % Land Flooded",
    expected: true,
    actual: topPopIsHumanitarianDelta && topLandIsLowLyingOrAtoll && sortedByPop[0].country.id !== sortedByLand[0].country.id,
    detail: "Sorting by population surfaces vulnerable mega-deltas, while sorting by land surfaces low-lying atoll nations."
  });

  const passed = checks.every(c => c.expected === c.actual);
  return { passed, checks };
}
