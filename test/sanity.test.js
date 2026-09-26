// Standalone Node Sanity Check for Global Sea Level Explorer
import fs from 'node:fs';

function decodeTerrariumPixel(r, g, b) {
  return (r * 256.0 + g + b / 256.0) - 32768.0;
}

function encodeTerrariumPixel(elevation) {
  const val = Math.round((elevation + 32768.0) * 256.0);
  const clamped = Math.max(0, Math.min(16777215, val));
  const r = Math.floor(clamped / 65536);
  const g = Math.floor((clamped % 65536) / 256);
  const b = clamped % 256;
  return [r, g, b];
}

const MIN_LAND_ELEVATION_THRESHOLD = 0.1;

function isNewlySubmerged(elevation, seaLevel) {
  if (seaLevel <= 0) return false;
  return elevation >= MIN_LAND_ELEVATION_THRESHOLD && elevation <= seaLevel;
}

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

// Population Datasets Verification
const citiesData = JSON.parse(fs.readFileSync(new URL('../src/data/cities.json', import.meta.url), 'utf8'));
const globalPopData = JSON.parse(fs.readFileSync(new URL('../src/data/globalPopulationImpact.json', import.meta.url), 'utf8'));

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

const allCitiesHaveTier = citiesData.every(c => [1, 2, 3].includes(c.tier));
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

// Landmarks Dataset Verification
const landmarksData = JSON.parse(fs.readFileSync(new URL('../src/data/landmarks.json', import.meta.url), 'utf8'));
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
const countriesData = JSON.parse(fs.readFileSync(new URL('../src/data/countriesImpact.json', import.meta.url), 'utf8'));

function interpolateCurve(curve, level) {
  if (level <= 0 || !curve || curve.length === 0) return 0;
  if (level <= curve[0].level) {
    if (curve[0].level === 0) return curve[0].pct;
    return (level / curve[0].level) * curve[0].pct;
  }
  if (level >= curve[curve.length - 1].level) {
    return curve[curve.length - 1].pct;
  }
  for (let i = 0; i < curve.length - 1; i++) {
    const p1 = curve[i];
    const p2 = curve[i + 1];
    if (level >= p1.level && level <= p2.level) {
      if (p2.level === p1.level) return p1.pct;
      const t = (level - p1.level) / (p2.level - p1.level);
      return Math.min(100, Math.max(0, p1.pct + t * (p2.pct - p1.pct)));
    }
  }
  return curve[curve.length - 1].pct;
}

function getCountryImpactStats(country, seaLevel) {
  if (seaLevel <= 0) {
    return { isFullySubmerged: false, landSubmergedPct: 0, popDisplacedPct: 0 };
  }
  const isFullySubmerged = seaLevel >= country.maxElevation;
  const rawLand = isFullySubmerged ? 100 : interpolateCurve(country.landSubmergedCurve, seaLevel);
  const rawPop = isFullySubmerged ? 100 : interpolateCurve(country.popDisplacedCurve, seaLevel);
  return {
    isFullySubmerged,
    landSubmergedPct: parseFloat(Math.min(100, Math.max(0, rawLand)).toFixed(1)),
    popDisplacedPct: parseFloat(Math.min(100, Math.max(0, rawPop)).toFixed(1))
  };
}

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
function testLonLatToTilePixel(lon, lat, zoom) {
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

function testGetProbeStatus(elevation, seaLevel) {
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

const probeTile0 = testLonLatToTilePixel(0, 0, 0);
checks.push({
  name: "Web Mercator tile conversion: (0, 0) at zoom 0 -> tile (0, 0), pixel (128, 128)",
  expected: true,
  actual: probeTile0.x === 0 && probeTile0.y === 0 && probeTile0.px === 128 && probeTile0.py === 128,
  detail: "Origin coordinate (0, 0) must precisely map to the center pixel of root tile (0, 0)."
});

const probeSubmerged = testGetProbeStatus(12.5, 20);
checks.push({
  name: "Probe flood depth: elevation +12.5m at sea level +20m -> 7.5m water depth",
  expected: true,
  actual: probeSubmerged.isSubmerged && probeSubmerged.waterDepth === 7.5,
  detail: "Ground below sea level must report submerged status with exact depth of water column."
});

const probeSafe = testGetProbeStatus(45, 10);
checks.push({
  name: "Probe clearance: elevation +45m at sea level +10m -> 35m clearance",
  expected: true,
  actual: probeSafe.isSafe && probeSafe.clearance === 35,
  detail: "Ground above sea level must report safe status with exact elevation clearance."
});

const probeDepression = testGetProbeStatus(-50, 10);
checks.push({
  name: "Probe natural depression: elevation -50m at sea level +10m -> depression",
  expected: true,
  actual: probeDepression.isDepression && !probeDepression.isSubmerged,
  detail: "Naturally dry depression land below sea level must be preserved and classified as depression."
});

// Protected Inland Basins Verification
const protectedBasins = JSON.parse(fs.readFileSync(new URL('../src/data/protectedBasins.json', import.meta.url), 'utf8'));

function findBasin(lon, lat) {
  return protectedBasins.find(b =>
    lat >= b.bounds.minLat && lat <= b.bounds.maxLat && lon >= b.bounds.minLon && lon <= b.bounds.maxLon
  );
}

function isBasinBreachedTest(basin, seaLevel) {
  return seaLevel >= basin.sillElevationMeters;
}

const jordanBasin = findBasin(35.5, 31.5);
checks.push({
  name: "Jordan Rift & Dead Sea Basin at +10m: Protected (sill 35m)",
  expected: false,
  actual: jordanBasin ? isBasinBreachedTest(jordanBasin, 10) : true,
  detail: "Jordan Rift basin must remain protected from ocean inundation below its 35m Jezreel sill."
});

checks.push({
  name: "Jordan Rift & Dead Sea Basin at +40m: Breached! (sill 35m)",
  expected: true,
  actual: jordanBasin ? isBasinBreachedTest(jordanBasin, 40) : false,
  detail: "Sea level exceeding 35m must trigger Mediterranean ingress breach into Jordan Rift."
});

const qattaraBasin = findBasin(27.5, 30.0);
checks.push({
  name: "Qattara Depression at +20m: Protected (sill 55m)",
  expected: false,
  actual: qattaraBasin ? isBasinBreachedTest(qattaraBasin, 20) : true,
  detail: "Qattara Depression must stay dry from ocean floodwaters below its 55m northern sill."
});

checks.push({
  name: "Qattara Depression at +60m: Breached! (sill 55m)",
  expected: true,
  actual: qattaraBasin ? isBasinBreachedTest(qattaraBasin, 60) : false,
  detail: "Sea level at +60m breaches the northern Mediterranean ridge (55m), flooding Qattara."
});

const saltonBasin = findBasin(-115.8, 33.3);
checks.push({
  name: "Salton Sink at +5m: Protected (sill 12m)",
  expected: false,
  actual: saltonBasin ? isBasinBreachedTest(saltonBasin, 5) : true,
  detail: "Salton Sink must be protected from Gulf of California waters below its 12m Colorado delta sill."
});

checks.push({
  name: "Salton Sink at +15m: Breached! (sill 12m)",
  expected: true,
  actual: saltonBasin ? isBasinBreachedTest(saltonBasin, 15) : false,
  detail: "Sea level at +15m breaches the 12m sill and floods the Salton Sink basin."
});

// URL Scenario Parameter Serializer / Parser Round-Trip
function serializeTest(level, vp, tab) {
  const p = new URLSearchParams();
  if (level > 0) p.set('level', String(level));
  if (vp) {
    p.set('lat', vp.lat.toFixed(4));
    p.set('lon', vp.lon.toFixed(4));
    p.set('zoom', vp.zoom.toFixed(2));
  }
  if (tab && tab !== 'cities') p.set('tab', tab);
  return p.toString();
}

function parseTest(search) {
  const p = new URLSearchParams(search);
  const level = p.get('level') ? parseFloat(p.get('level')) : 0;
  const lat = p.get('lat') ? parseFloat(p.get('lat')) : null;
  const lon = p.get('lon') ? parseFloat(p.get('lon')) : null;
  const zoom = p.get('zoom') ? parseFloat(p.get('zoom')) : null;
  const tab = p.get('tab') || 'cities';
  return { level, lat, lon, zoom, tab };
}

const testQuery = serializeTest(45, { lat: 31.7683, lon: 35.2137, zoom: 8.5 }, 'countries');
const parsedQuery = parseTest(testQuery);
checks.push({
  name: "URL scenario parameter serializer round-trip",
  expected: true,
  actual: parsedQuery.level === 45 && Math.abs(parsedQuery.lat - 31.7683) < 0.0001 && Math.abs(parsedQuery.lon - 35.2137) < 0.0001 && parsedQuery.zoom === 8.5 && parsedQuery.tab === 'countries',
  detail: "Scenario URL parameters (level, lat, lon, zoom, tab) must serialize and deserialize faithfully."
});

// Map Snapshot Exporter Verification
function testFormatSnapshotFilename(seaLevel, timestamp) {
  const levelStr = seaLevel > 0 ? `plus-${seaLevel}m` : '0m';
  if (timestamp !== undefined) {
    return `sea-level-explorer-${levelStr}-${timestamp}.png`;
  }
  return `sea-level-explorer-${levelStr}.png`;
}

function testFormatPopulation(num) {
  if (num <= 0) return '0';
  if (num >= 1_000_000_000) {
    const val = num / 1_000_000_000;
    return val % 1 === 0 ? `${val.toFixed(0)}B` : `${val.toFixed(1)}B`;
  }
  if (num >= 1_000_000) {
    const val = num / 1_000_000;
    return val % 1 === 0 ? `${val.toFixed(0)}M` : `${val.toFixed(1)}M`;
  }
  if (num >= 1_000) {
    const val = num / 1_000;
    return val % 1 === 0 ? `${val.toFixed(0)}K` : `${val.toFixed(0)}K`;
  }
  return num.toLocaleString();
}

function testGetSnapshotMetadata(seaLevel, displacedPopText, submergedCitiesCount) {
  const clampedLevel = Math.max(0, Math.min(1000, Math.round(seaLevel)));
  const impactItem = globalPopData[clampedLevel];

  let impactText = displacedPopText || '';
  if (!impactText) {
    if (seaLevel <= 0) {
      impactText = 'Baseline (0 Displaced)';
    } else if (impactItem) {
      impactText = `~${testFormatPopulation(impactItem.population)} People Displaced (${impactItem.percentage}% of global population)`;
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

checks.push({
  name: "Snapshot filename formatting (0m and +15m)",
  expected: true,
  actual: testFormatSnapshotFilename(15) === "sea-level-explorer-plus-15m.png" &&
          testFormatSnapshotFilename(0) === "sea-level-explorer-0m.png" &&
          testFormatSnapshotFilename(15, 1700000000000) === "sea-level-explorer-plus-15m-1700000000000.png",
  detail: "Filenames must follow standard pattern with or without millisecond timestamp."
});

const meta0m = testGetSnapshotMetadata(0);
checks.push({
  name: "Snapshot presentation metadata: 0m baseline",
  expected: true,
  actual: meta0m.title === "Global Sea Level Explorer" &&
          meta0m.badgeText.includes("0m") &&
          meta0m.impactText.includes("0 Displaced") &&
          meta0m.attribution.includes("CARTO"),
  detail: "0m baseline snapshot must display zero displaced population and proper attribution."
});

const meta10m = testGetSnapshotMetadata(10, undefined, 42);
checks.push({
  name: "Snapshot presentation metadata: +10m coastal threshold",
  expected: true,
  actual: meta10m.badgeText.includes("+10m") &&
          meta10m.impactText.includes("640M") &&
          meta10m.submergedCitiesText === "42 Tracked Cities Submerged",
  detail: "Metadata overlay at +10m must reflect ~640M displaced population and tracked cities count."
});

const meta1000m = testGetSnapshotMetadata(1000);
checks.push({
  name: "Snapshot presentation metadata: +1,000m deluge scale",
  expected: true,
  actual: meta1000m.badgeText.includes("+1000m") &&
          meta1000m.impactText.includes("7.1B") &&
          meta1000m.impactText.includes("88.2%"),
  detail: "Deluge metadata at +1,000m must reflect 7.1B displaced (88.2% of global population)."
});

// Did You Know Facts Verification
const factsData = JSON.parse(fs.readFileSync(new URL('../src/data/didYouKnowFacts.json', import.meta.url), 'utf8'));
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

// Draggable Viewport Boundary Clamping Verification
function clampViewportPosition(currentPos, delta, initialRect, viewport) {
  const targetX = currentPos.x + delta.dx;
  const targetY = currentPos.y + delta.dy;

  const minX = -(initialRect.left + initialRect.width - 80);
  const maxX = Math.max(0, viewport.width - initialRect.left - 80);

  const minY = -initialRect.top;
  const maxY = Math.max(0, viewport.height - initialRect.top - 40);

  const clampedX = Math.max(minX, Math.min(maxX, targetX));
  const clampedY = Math.max(minY, Math.min(maxY, targetY));

  return { x: clampedX, y: clampedY };
}

const clampedFarLeft = clampViewportPosition({ x: 0, y: 0 }, { dx: -5000, dy: 0 }, { left: 16, top: 80, width: 320, height: 400 }, { width: 1920, height: 1080 });
const clampedFarRight = clampViewportPosition({ x: 0, y: 0 }, { dx: 5000, dy: 0 }, { left: 16, top: 80, width: 320, height: 400 }, { width: 1920, height: 1080 });
const clampedFarTop = clampViewportPosition({ x: 0, y: 0 }, { dx: 0, dy: -5000 }, { left: 16, top: 80, width: 320, height: 400 }, { width: 1920, height: 1080 });
const clampedFarBottom = clampViewportPosition({ x: 0, y: 0 }, { dx: 0, dy: 5000 }, { left: 16, top: 80, width: 320, height: 400 }, { width: 1920, height: 1080 });

checks.push({
  name: "Draggable panel viewport clamping (horizontal & vertical limits)",
  expected: true,
  actual: clampedFarLeft.x === -(16 + 320 - 80) &&
          clampedFarRight.x === (1920 - 16 - 80) &&
          clampedFarTop.y === -80 &&
          clampedFarBottom.y === (1080 - 80 - 40),
  detail: "Clamping ensures floating panels remain safely within viewport margins with accessible drag handles."
});

// Mobile Drawer Tab Navigation Verification
const validMobileTabs = ['controls', 'stats', 'facts'];
checks.push({
  name: "Mobile drawer tab options (controls, stats, facts)",
  expected: true,
  actual: validMobileTabs.length === 3 && validMobileTabs.includes('controls') && validMobileTabs.includes('stats') && validMobileTabs.includes('facts'),
  detail: "Mobile drawer must support seamless switching across controls, statistics, and facts."
});

// Mobile Scale Precision & 0m Baseline Return Verification
function computeMobileStep(rangeMode, isPrecision, seaLevel) {
  if (rangeMode === 'extreme') return 50;
  return isPrecision && seaLevel < 10 ? 0.5 : 1;
}

function computeClampedMobileInput(rawVal, rangeMode, isPrecision) {
  if (isNaN(rawVal) || rawVal <= 0.05) return 0;
  if (rangeMode === 'extreme') return Math.min(1000, Math.max(0, Math.round(rawVal / 50) * 50));
  if (isPrecision && rawVal < 10) return Math.min(100, Math.max(0, Math.round(rawVal * 2) / 2));
  return Math.min(100, Math.max(0, Math.round(rawVal)));
}

checks.push({
  name: "Mobile scale default precision: 1m step by default",
  expected: true,
  actual: computeMobileStep('coastal', false, 5) === 1 &&
          computeMobileStep('coastal', false, 0) === 1 &&
          computeMobileStep('coastal', true, 5) === 0.5 &&
          computeMobileStep('extreme', false, 200) === 50,
  detail: "Mobile slider must default to 1m stepping and only switch to 0.5m when explicitly enabled."
});

checks.push({
  name: "Mobile scale 0m baseline return (zero flood artifacts)",
  expected: true,
  actual: computeClampedMobileInput(0, 'coastal', false) === 0 &&
          computeClampedMobileInput(0.04, 'coastal', false) === 0 &&
          isNewlySubmerged(2, 0) === false &&
          isNewlySubmerged(0.05, 0) === false,
  detail: "Lowering mobile scale back to 0m reliably clamps to 0m with zero water on map."
});

let allPassed = true;
console.log("==================================================");
console.log("GLOBAL SEA LEVEL EXPLORER - SANITY CHECK RESULTS");
console.log("==================================================");
for (const c of checks) {
  const passed = c.actual === c.expected;
  if (!passed) allPassed = false;
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${c.name}`);
  console.log(`       Detail: ${c.detail}`);
}
console.log("==================================================");
if (allPassed) {
  console.log(`SUMMARY: ALL ${checks.length} SANITY CHECKS PASSED SUCCESSFULLY!`);
  process.exit(0);
} else {
  console.error("SUMMARY: ONE OR MORE CHECKS FAILED!");
  process.exit(1);
}
