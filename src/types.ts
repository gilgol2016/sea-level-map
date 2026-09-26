export interface City {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  elevation: number; // in meters above sea level
  population: number; // Metro area population
  tier?: 1 | 2 | 3; // 1: Mega-city/capital (z0+), 2: Major hub (z4+), 3: Regional/coastal (z6+)
  isDepression?: boolean; // natural depression or below-sea-level dry land today
}

export type LandmarkCategory = 'heritage' | 'monument' | 'natural' | 'structure';

export interface Landmark {
  id: string;
  name: string;
  category: LandmarkCategory;
  country: string;
  lat: number;
  lon: number;
  elevation: number; // in meters above sea level
  description: string;
  isDepression?: boolean;
}

export interface PopulationImpact {
  elevation: number;
  population: number;
  percentage: number;
}

export interface Hotspot {
  name: string;
  region: string;
  lat: number;
  lon: number;
  zoom: number;
}

export interface CountryImpact {
  id: string; // ISO 3166-1 alpha-3 (e.g. "MDV", "NLD", "BGD")
  name: string;
  flag: string; // Flag emoji
  region: string;
  totalPopulation: number;
  totalAreaKm2: number;
  maxElevation: number; // Highest natural point on land in meters
  lat: number; // Centroid latitude for camera flyTo
  lon: number; // Centroid longitude
  zoom: number; // Recommended zoom level
  isIslandNation: boolean;
  // Cumulative % of land submerged at key elevations [0, 1, 2, 5, 10, 25, 50, 66, 100, 200, 500, 1000]
  landSubmergedCurve: { level: number; pct: number }[];
  // Cumulative % of population displaced at key elevations
  popDisplacedCurve: { level: number; pct: number }[];
}

export interface CountryCalculatedImpact {
  country: CountryImpact;
  isFullySubmerged: boolean;
  landSubmergedPct: number;
  popDisplacedPct: number;
  displacedPopulation: number;
  submergedAreaKm2: number;
}

export interface ProbeLocation {
  lat: number;
  lon: number;
  elevation: number;
}

export interface ProtectedBasin {
  id: string;
  name: string;
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  sillElevationMeters: number; // Lowest mountain pass connecting to global ocean
  barrierDescription: string;
}

export interface ProbeStatus {
  elevation: number;
  isSubmerged: boolean;
  isDepression: boolean;
  isSafe: boolean;
  waterDepth: number; // in meters if submerged
  clearance: number; // in meters if safe
  statusText: string;
  badgeType: 'submerged' | 'safe' | 'depression' | 'basin_protected';
  isBasinProtected?: boolean;
  sillElevation?: number;
}

export type FactCategory = 'geography' | 'population' | 'economy' | 'history' | 'heritage' | 'deluge';

export interface DidYouKnowFact {
  id: string;
  category: FactCategory;
  title: string;
  fact: string;
  highlightLevel?: number;
  tags: string[];
}

