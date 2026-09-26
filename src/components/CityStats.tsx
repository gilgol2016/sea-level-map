import React, { useState, useMemo } from 'react';
import { City, Landmark, PopulationImpact, CountryImpact, CountryCalculatedImpact, Hotspot } from '../types';
import { Search, AlertTriangle, ShieldCheck, Info, ChevronDown, ChevronUp, Users, HelpCircle, X, MapPin, Landmark as LandmarkIcon, CheckSquare, Square, Globe, GripHorizontal } from 'lucide-react';
import globalPopData from '../data/globalPopulationImpact.json';
import rawCountriesData from '../data/countriesImpact.json';
import { formatPopulation } from '../utils/formatters';
import { getCountryImpactStats } from '../utils/countryImpactUtils';
import { findProtectedBasin, isBasinBreached } from '../utils/basinProtection';

const POP_IMPACT_DATA: PopulationImpact[] = globalPopData as PopulationImpact[];
const COUNTRIES_LIST: CountryImpact[] = rawCountriesData as CountryImpact[];

const CATEGORY_ICONS: Record<string, string> = {
  heritage: '🏛️',
  monument: '🗿',
  natural: '🌲',
  structure: '🏗️'
};

interface CityStatsProps {
  cities: City[];
  landmarks: Landmark[];
  seaLevel: number;
  selectedCity: City | null;
  onSelectCity: (city: City | null) => void;
  selectedLandmark: Landmark | null;
  onSelectLandmark: (landmark: Landmark | null) => void;
  showCities: boolean;
  onToggleShowCities: () => void;
  showLandmarks: boolean;
  onToggleShowLandmarks: () => void;
  onOpenSanityModal: () => void;
  onSelectHotspot?: (hotspot: Hotspot) => void;
  activeTab?: 'cities' | 'landmarks' | 'countries';
  onActiveTabChange?: (tab: 'cities' | 'landmarks' | 'countries') => void;
  onDragStart?: (e: React.PointerEvent) => void;
}

export const CityStats: React.FC<CityStatsProps> = ({
  cities,
  landmarks,
  seaLevel,
  selectedCity,
  onSelectCity,
  selectedLandmark,
  onSelectLandmark,
  showCities,
  onToggleShowCities,
  showLandmarks,
  onToggleShowLandmarks,
  onOpenSanityModal,
  onSelectHotspot,
  activeTab: activeTabProp,
  onActiveTabChange,
  onDragStart
}) => {
  const [internalTab, setInternalTab] = useState<'cities' | 'landmarks' | 'countries'>('cities');
  const activeTab = activeTabProp ?? internalTab;

  const handleTabChange = (tab: 'cities' | 'landmarks' | 'countries') => {
    setInternalTab(tab);
    onActiveTabChange?.(tab);
    setSearchTerm('');
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [cityFilterMode, setCityFilterMode] = useState<'all' | 'submerged' | 'safe'>('submerged');
  const [landmarkFilterMode, setLandmarkFilterMode] = useState<'all' | 'submerged' | 'safe'>('all');
  const [countryFilterMode, setCountryFilterMode] = useState<'all' | 'submerged100' | 'affected' | 'islands'>('all');
  const [countrySortMode, setCountrySortMode] = useState<'pop' | 'land'>('pop');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<'global' | 'metros' | null>(null);

  const toggleTooltip = (type: 'global' | 'metros') => {
    setActiveTooltip((prev) => (prev === type ? null : type));
  };

  // Categorize cities with hydrological basin sill protection
  const { submergedCities, safeCities, depressionCities, submergedMetroPopulation } = useMemo(() => {
    const submerged: City[] = [];
    const safe: City[] = [];
    const depressions: City[] = [];
    let submergedPop = 0;

    for (const city of cities) {
      const basin = findProtectedBasin(city.lon, city.lat);
      const isBreached = basin ? isBasinBreached(basin, seaLevel) : false;
      const isProtected = basin ? !isBreached : false;

      if (isProtected) {
        if (city.isDepression || city.elevation <= 0) {
          depressions.push(city);
        } else {
          safe.push(city);
        }
      } else if (isBreached && city.elevation <= seaLevel) {
        submerged.push(city);
        submergedPop += city.population || 0;
      } else if (city.isDepression || city.elevation <= 0) {
        depressions.push(city);
      } else if (city.elevation <= seaLevel) {
        submerged.push(city);
        submergedPop += city.population || 0;
      } else {
        safe.push(city);
      }
    }

    submerged.sort((a, b) => a.elevation - b.elevation);
    safe.sort((a, b) => a.elevation - b.elevation);

    return {
      submergedCities: submerged,
      safeCities: safe,
      depressionCities: depressions,
      submergedMetroPopulation: submergedPop
    };
  }, [cities, seaLevel]);

  // Categorize landmarks with hydrological basin sill protection
  const { submergedLandmarks, safeLandmarks, depressionLandmarks } = useMemo(() => {
    const submerged: Landmark[] = [];
    const safe: Landmark[] = [];
    const depressions: Landmark[] = [];

    for (const landmark of landmarks) {
      const basin = findProtectedBasin(landmark.lon, landmark.lat);
      const isBreached = basin ? isBasinBreached(basin, seaLevel) : false;
      const isProtected = basin ? !isBreached : false;

      if (isProtected) {
        if (landmark.isDepression || landmark.elevation <= 0) {
          depressions.push(landmark);
        } else {
          safe.push(landmark);
        }
      } else if (isBreached && landmark.elevation <= seaLevel) {
        submerged.push(landmark);
      } else if (landmark.isDepression || landmark.elevation <= 0) {
        depressions.push(landmark);
      } else if (landmark.elevation <= seaLevel) {
        submerged.push(landmark);
      } else {
        safe.push(landmark);
      }
    }

    submerged.sort((a, b) => a.elevation - b.elevation);
    safe.sort((a, b) => a.elevation - b.elevation);

    return {
      submergedLandmarks: submerged,
      safeLandmarks: safe,
      depressionLandmarks: depressions
    };
  }, [landmarks, seaLevel]);

  // Current global population impact entry
  const globalImpact = useMemo(() => {
    const clampedLevel = Math.max(0, Math.min(1000, Math.round(seaLevel)));
    return POP_IMPACT_DATA[clampedLevel] || { elevation: clampedLevel, population: 0, percentage: 0 };
  }, [seaLevel]);

  // Filter cities by search term and mode
  const filteredCities = useMemo(() => {
    let list: City[] = [];
    if (cityFilterMode === 'submerged') list = submergedCities;
    else if (cityFilterMode === 'safe') list = safeCities;
    else list = cities;

    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.country.toLowerCase().includes(term)
    );
  }, [cityFilterMode, submergedCities, safeCities, cities, searchTerm]);

  // Filter landmarks by search term and mode
  const filteredLandmarks = useMemo(() => {
    let list: Landmark[] = [];
    if (landmarkFilterMode === 'submerged') list = submergedLandmarks;
    else if (landmarkFilterMode === 'safe') list = safeLandmarks;
    else list = landmarks;

    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(
      (l) =>
        l.name.toLowerCase().includes(term) ||
        l.country.toLowerCase().includes(term) ||
        l.category.toLowerCase().includes(term)
    );
  }, [landmarkFilterMode, submergedLandmarks, safeLandmarks, landmarks, searchTerm]);

  const totalTrackedCities = cities.length;
  const submergedCitiesCount = submergedCities.length;
  const submergedCitiesPercent = ((submergedCitiesCount / totalTrackedCities) * 100).toFixed(1);

  const totalLandmarks = landmarks.length;
  const submergedLandmarksCount = submergedLandmarks.length;
  const submergedLandmarksPercent = ((submergedLandmarksCount / totalLandmarks) * 100).toFixed(1);

  // Calculate national-level inundation impacts
  const countryStatsList = useMemo(() => {
    return COUNTRIES_LIST.map((country) => getCountryImpactStats(country, seaLevel));
  }, [seaLevel]);

  const { fullySubmergedCountries, affectedCountries, islandCountries } = useMemo(() => {
    const submerged100: CountryCalculatedImpact[] = [];
    const affected: CountryCalculatedImpact[] = [];
    const islands: CountryCalculatedImpact[] = [];

    for (const c of countryStatsList) {
      if (c.isFullySubmerged) {
        submerged100.push(c);
      }
      if (c.landSubmergedPct > 0 || c.popDisplacedPct > 0) {
        affected.push(c);
      }
      if (c.country.isIslandNation) {
        islands.push(c);
      }
    }

    return {
      fullySubmergedCountries: submerged100,
      affectedCountries: affected,
      islandCountries: islands
    };
  }, [countryStatsList]);

  // Top 5 Humanitarian Displacement Leaderboard
  const topDisplacedCountries = useMemo(() => {
    return [...countryStatsList]
      .filter((c) => c.displacedPopulation > 0)
      .sort((a, b) => b.displacedPopulation - a.displacedPopulation)
      .slice(0, 5);
  }, [countryStatsList]);

  // Filter and sort countries
  const filteredCountries = useMemo(() => {
    let list: CountryCalculatedImpact[] = [];
    if (countryFilterMode === 'submerged100') list = fullySubmergedCountries;
    else if (countryFilterMode === 'affected') list = affectedCountries;
    else if (countryFilterMode === 'islands') list = islandCountries;
    else list = countryStatsList;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        (c) =>
          c.country.name.toLowerCase().includes(term) ||
          c.country.region.toLowerCase().includes(term) ||
          c.country.id.toLowerCase().includes(term)
      );
    }

    return [...list].sort((a, b) => {
      // 100% submerged always float to top
      if (a.isFullySubmerged !== b.isFullySubmerged) {
        return a.isFullySubmerged ? -1 : 1;
      }
      if (countrySortMode === 'pop') {
        if (b.displacedPopulation !== a.displacedPopulation) {
          return b.displacedPopulation - a.displacedPopulation;
        }
        return b.landSubmergedPct - a.landSubmergedPct;
      } else {
        if (b.landSubmergedPct !== a.landSubmergedPct) {
          return b.landSubmergedPct - a.landSubmergedPct;
        }
        return b.displacedPopulation - a.displacedPopulation;
      }
    });
  }, [countryFilterMode, countrySortMode, fullySubmergedCountries, affectedCountries, islandCountries, countryStatsList, searchTerm]);

  return (
    <div
      onClick={() => setActiveTooltip(null)}
      className="bg-slate-900/90 backdrop-blur-md border border-slate-700/60 rounded-2xl p-4 shadow-2xl text-slate-100 flex flex-col max-w-sm w-full transition-all"
    >
      {/* Header & Toggle */}
      <div
        onPointerDown={onDragStart}
        className={`flex items-center justify-between pb-3 border-b border-slate-800 ${onDragStart ? 'cursor-grab active:cursor-grabbing select-none' : ''}`}
      >
        <div className="flex items-center gap-2">
          {onDragStart && (
            <div className="hidden sm:flex text-slate-500 hover:text-slate-300">
              <GripHorizontal className="w-4 h-4" />
            </div>
          )}
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>Impact Statistics</span>
            </h2>
            <p className="text-xs text-slate-400">
              {activeTab === 'cities'
                ? `${submergedCitiesCount} of ${totalTrackedCities} cities (${submergedCitiesPercent}%)`
                : activeTab === 'landmarks'
                ? `${submergedLandmarksCount} of ${totalLandmarks} landmarks (${submergedLandmarksPercent}%)`
                : `${fullySubmergedCountries.length} fully submerged • ${affectedCountries.length} impacted`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onOpenSanityModal}
            className="p-1.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-900 transition text-xs font-semibold flex items-center gap-1"
            title="View depression verification checks"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="text-[11px]">Sanity Tests</span>
          </button>

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="flex flex-col gap-3 pt-3">
          {/* Map Layer Visibility Checkboxes */}
          <div className="flex items-center justify-between bg-slate-850/80 bg-slate-800/50 rounded-xl px-3 py-2 border border-slate-700/60 text-xs">
            <span className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">Map Layers:</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onToggleShowCities}
                className="flex items-center gap-1.5 text-slate-300 hover:text-white transition cursor-pointer select-none"
                title="Toggle cities on map"
              >
                {showCities ? (
                  <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span className={showCities ? 'text-cyan-200 font-medium' : 'text-slate-500'}>Cities ({cities.length})</span>
              </button>

              <button
                type="button"
                onClick={onToggleShowLandmarks}
                className="flex items-center gap-1.5 text-slate-300 hover:text-white transition cursor-pointer select-none"
                title="Toggle iconic landmarks on map"
              >
                {showLandmarks ? (
                  <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span className={showLandmarks ? 'text-amber-200 font-medium' : 'text-slate-500'}>Landmarks ({landmarks.length})</span>
              </button>
            </div>
          </div>

          {/* Primary View Tabs: Cities vs Landmarks vs Countries */}
          <div className="grid grid-cols-3 gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800 text-[11px] font-semibold">
            <button
              onClick={() => handleTabChange('cities')}
              className={`flex items-center justify-center gap-1 py-1.5 rounded-lg transition ${
                activeTab === 'cities'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Cities ({cities.length})</span>
            </button>

            <button
              onClick={() => handleTabChange('landmarks')}
              className={`flex items-center justify-center gap-1 py-1.5 rounded-lg transition ${
                activeTab === 'landmarks'
                  ? 'bg-gradient-to-r from-amber-600 to-yellow-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <LandmarkIcon className="w-3.5 h-3.5" />
              <span>Landmarks ({landmarks.length})</span>
            </button>

            <button
              onClick={() => handleTabChange('countries')}
              className={`flex items-center justify-center gap-1 py-1.5 rounded-lg transition ${
                activeTab === 'countries'
                  ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Nations ({COUNTRIES_LIST.length})</span>
            </button>
          </div>

          {/* Tab 1: Cities Impact View */}
          {activeTab === 'cities' && (
            <>
              {/* Population Impact Card */}
              <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span className="flex items-center gap-1.5 text-cyan-400">
                    <Users className="w-4 h-4" />
                    <span>Population Exposure</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">~8.05B Global</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center pt-1 border-t border-slate-700/60">
                  {/* Global Population Box */}
                  <div className="relative bg-slate-900/60 rounded-lg p-2.5 border border-slate-800 flex flex-col justify-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTooltip('global');
                      }}
                      className={`absolute top-1 right-1 p-1 transition rounded focus:outline-none ${
                        activeTooltip === 'global'
                          ? 'text-cyan-400 bg-cyan-950/60 ring-1 ring-cyan-500/50'
                          : 'text-slate-500 hover:text-cyan-400'
                      }`}
                      aria-label="Toggle Global Exposure explanation"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>

                    {activeTooltip === 'global' && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTooltip(null);
                        }}
                        className="absolute bottom-full mb-2 left-0 sm:left-1/2 sm:-translate-x-1/2 w-52 p-2.5 bg-slate-950/95 border border-slate-700 rounded-xl text-[11px] text-slate-200 shadow-2xl backdrop-blur-md transition-all z-40 text-left cursor-pointer"
                      >
                        <div className="flex items-center justify-between font-bold text-cyan-400 mb-1">
                          <span>Global Exposure</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveTooltip(null);
                            }}
                            className="p-0.5 text-slate-400 hover:text-white rounded transition"
                            aria-label="Close"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="text-slate-300 leading-snug">
                          Estimated worldwide human population living below this elevation (~8.05B baseline). Represents human population, not total land area.
                        </div>
                        <div className="absolute top-full left-6 sm:left-1/2 sm:-translate-x-1/2 border-4 border-transparent border-t-slate-700" />
                      </div>
                    )}

                    <div className="text-base font-black text-cyan-400 leading-tight">
                      {formatPopulation(globalImpact.population)}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      ({globalImpact.percentage}% of global pop)
                    </div>
                  </div>

                  {/* Submerged Metros Box */}
                  <div className="relative bg-slate-900/60 rounded-lg p-2.5 border border-slate-800 flex flex-col justify-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTooltip('metros');
                      }}
                      className={`absolute top-1 right-1 p-1 transition rounded focus:outline-none ${
                        activeTooltip === 'metros'
                          ? 'text-amber-400 bg-amber-950/60 ring-1 ring-amber-500/50'
                          : 'text-slate-500 hover:text-amber-400'
                      }`}
                      aria-label="Toggle Submerged Metros explanation"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>

                    {activeTooltip === 'metros' && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTooltip(null);
                        }}
                        className="absolute bottom-full mb-2 right-0 w-52 p-2.5 bg-slate-950/95 border border-slate-700 rounded-xl text-[11px] text-slate-200 shadow-2xl backdrop-blur-md transition-all z-40 text-left cursor-pointer"
                      >
                        <div className="flex items-center justify-between font-bold text-amber-400 mb-1">
                          <span>Submerged Metros</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveTooltip(null);
                            }}
                            className="p-0.5 text-slate-400 hover:text-white rounded transition"
                            aria-label="Close"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="text-slate-300 leading-snug">
                          A city is marked submerged when its reference coordinate point is below the selected sea level. This does NOT mean 100% of the city or metropolitan area is underwater.
                        </div>
                        <div className="absolute top-full right-3 border-4 border-transparent border-t-slate-700" />
                      </div>
                    )}

                    <div className="text-base font-black text-amber-400 leading-tight">
                      {formatPopulation(submergedMetroPopulation)}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Submerged Metros
                    </div>
                  </div>
                </div>
              </div>

              {/* City Count Summary Badges */}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-2.5">
                  <div className="text-xl font-black text-red-400 leading-tight">
                    {submergedCitiesCount}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Newly Submerged
                  </div>
                </div>

                <div className="bg-sky-950/40 border border-sky-500/30 rounded-xl p-2.5">
                  <div className="text-xl font-black text-sky-400 leading-tight">
                    {safeCities.length}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Above Water
                  </div>
                </div>
              </div>

              {/* Depressions Protection Info Banner */}
              <div className="bg-amber-950/30 border border-amber-500/30 rounded-lg px-2.5 py-1.5 flex items-start gap-2 text-[11px] text-amber-200/90">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong>{depressionCities.length} natural depressions</strong> (e.g. Dead Sea, Baku, New Orleans, Amsterdam) are preserved and excluded from newly submerged count.
                </div>
              </div>

              {/* Search Input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search city or country..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-400 transition"
                />
              </div>

              {/* City Filter Tabs */}
              <div className="flex rounded-lg bg-slate-800 p-0.5 text-xs border border-slate-700">
                <button
                  onClick={() => setCityFilterMode('submerged')}
                  className={`flex-1 py-1 rounded-md font-semibold transition ${
                    cityFilterMode === 'submerged'
                      ? 'bg-red-500/80 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Submerged ({submergedCitiesCount})
                </button>
                <button
                  onClick={() => setCityFilterMode('safe')}
                  className={`flex-1 py-1 rounded-md font-semibold transition ${
                    cityFilterMode === 'safe'
                      ? 'bg-sky-500/80 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Safe ({safeCities.length})
                </button>
                <button
                  onClick={() => setCityFilterMode('all')}
                  className={`flex-1 py-1 rounded-md font-semibold transition ${
                    cityFilterMode === 'all'
                      ? 'bg-slate-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All ({totalTrackedCities})
                </button>
              </div>

              {/* City List Helper Note */}
              <div className="text-[10px] text-slate-400 italic px-1 pb-0.5">
                * Point elevation at city center — does not represent 100% urban area.
              </div>

              {/* City List */}
              <div className="max-h-56 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                {filteredCities.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400">
                    {seaLevel === 0 && cityFilterMode === 'submerged'
                      ? "At 0m, no land or cities are newly submerged."
                      : "No matching cities found."}
                  </div>
                ) : (
                  filteredCities.map((city) => {
                    const basin = findProtectedBasin(city.lon, city.lat);
                    const isBreached = basin ? isBasinBreached(basin, seaLevel) : false;
                    const isProtected = basin ? !isBreached : false;

                    let isSubmerged = false;
                    let isDepression = false;

                    if (isProtected) {
                      isDepression = !!city.isDepression || city.elevation <= 0;
                    } else if (isBreached && city.elevation <= seaLevel) {
                      isSubmerged = true;
                    } else {
                      isSubmerged = city.elevation > 0 && city.elevation <= seaLevel;
                      isDepression = !!city.isDepression || city.elevation <= 0;
                    }

                    const isSelected = selectedCity?.id === city.id;

                    return (
                      <button
                        key={city.id}
                        onClick={() => {
                          onSelectLandmark(null);
                          onSelectCity(city);
                        }}
                        title={`${city.name} (${city.country}) — Point elevation at city center (${city.elevation > 0 ? '+' : ''}${city.elevation}m). Does not represent 100% urban area.`}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-xs flex items-center justify-between transition ${
                          isSelected
                            ? 'bg-cyan-950/80 border-cyan-400 text-cyan-200'
                            : isSubmerged
                            ? 'bg-red-950/20 border-red-900/40 hover:bg-red-900/30 text-slate-200'
                            : isProtected
                            ? 'bg-emerald-950/20 border-emerald-900/40 hover:bg-emerald-900/30 text-slate-200'
                            : isDepression
                            ? 'bg-amber-950/20 border-amber-900/40 hover:bg-amber-900/30 text-slate-300'
                            : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-700/60 text-slate-300'
                        }`}
                      >
                        <div>
                          <div className="font-semibold flex items-center gap-1.5">
                            {city.name}
                            {isSubmerged && (
                              <AlertTriangle className="w-3 h-3 text-red-400 inline" />
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {city.country} &bull; Pop: {formatPopulation(city.population)}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-bold text-[11px]">
                            {city.elevation > 0 ? `+${city.elevation}m` : `${city.elevation}m`}
                          </div>
                          <div
                            className={`text-[9px] font-semibold uppercase ${
                              isSubmerged
                                ? 'text-red-400'
                                : isProtected
                                ? 'text-emerald-400'
                                : isDepression
                                ? 'text-amber-400'
                                : 'text-sky-400'
                            }`}
                          >
                            {isSubmerged
                              ? 'Submerged'
                              : isProtected
                              ? 'Protected'
                              : isDepression
                              ? 'Depression'
                              : 'Safe'}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}

          {/* Tab 2: Landmarks Impact View */}
          {activeTab === 'landmarks' && (
            <>
              {/* Landmark Count Summary Badges */}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-2.5">
                  <div className="text-xl font-black text-red-400 leading-tight">
                    {submergedLandmarksCount}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Newly Submerged
                  </div>
                </div>

                <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-2.5">
                  <div className="text-xl font-black text-amber-400 leading-tight">
                    {safeLandmarks.length}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Above Water
                  </div>
                </div>
              </div>

              {/* Landmark Summary Info */}
              <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
                <span className="text-slate-300">Heritage &amp; Wonders Tracked</span>
                <span className="font-bold text-amber-400">{totalLandmarks} Global Sites</span>
              </div>

              {depressionLandmarks.length > 0 && (
                <div className="bg-amber-950/30 border border-amber-500/30 rounded-lg px-2.5 py-1.5 flex items-start gap-2 text-[11px] text-amber-200/90">
                  <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong>{depressionLandmarks.length} natural depression</strong> (Dead Sea Shore at -430m) is naturally dry and excluded from newly submerged count.
                  </div>
                </div>
              )}

              {/* Search Input for Landmarks */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search landmark, country, type..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:border-amber-400 transition"
                />
              </div>

              {/* Landmark Filter Tabs */}
              <div className="flex rounded-lg bg-slate-800 p-0.5 text-xs border border-slate-700">
                <button
                  onClick={() => setLandmarkFilterMode('submerged')}
                  className={`flex-1 py-1 rounded-md font-semibold transition ${
                    landmarkFilterMode === 'submerged'
                      ? 'bg-red-500/80 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Submerged ({submergedLandmarksCount})
                </button>
                <button
                  onClick={() => setLandmarkFilterMode('safe')}
                  className={`flex-1 py-1 rounded-md font-semibold transition ${
                    landmarkFilterMode === 'safe'
                      ? 'bg-amber-500/80 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Safe ({safeLandmarks.length})
                </button>
                <button
                  onClick={() => setLandmarkFilterMode('all')}
                  className={`flex-1 py-1 rounded-md font-semibold transition ${
                    landmarkFilterMode === 'all'
                      ? 'bg-slate-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All ({totalLandmarks})
                </button>
              </div>

              {/* Landmark List */}
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                {filteredLandmarks.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400">
                    {seaLevel === 0 && landmarkFilterMode === 'submerged'
                      ? "At 0m, no iconic landmarks are newly submerged."
                      : "No matching landmarks found."}
                  </div>
                ) : (
                  filteredLandmarks.map((landmark) => {
                    const basin = findProtectedBasin(landmark.lon, landmark.lat);
                    const isBreached = basin ? isBasinBreached(basin, seaLevel) : false;
                    const isProtected = basin ? !isBreached : false;

                    let isSubmerged = false;
                    let isDepression = false;

                    if (isProtected) {
                      isDepression = !!landmark.isDepression || landmark.elevation <= 0;
                    } else if (isBreached && landmark.elevation <= seaLevel) {
                      isSubmerged = true;
                    } else {
                      isSubmerged = landmark.elevation > 0 && landmark.elevation <= seaLevel;
                      isDepression = !!landmark.isDepression || landmark.elevation <= 0;
                    }

                    const isSelected = selectedLandmark?.id === landmark.id;
                    const catIcon = CATEGORY_ICONS[landmark.category] || '📍';

                    return (
                      <button
                        key={landmark.id}
                        onClick={() => {
                          onSelectCity(null);
                          onSelectLandmark(landmark);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-xs flex items-center justify-between transition ${
                          isSelected
                            ? 'bg-amber-950/80 border-amber-400 text-amber-200'
                            : isSubmerged
                            ? 'bg-red-950/20 border-red-900/40 hover:bg-red-900/30 text-slate-200'
                            : isProtected
                            ? 'bg-emerald-950/20 border-emerald-900/40 hover:bg-emerald-900/30 text-slate-300'
                            : isDepression
                            ? 'bg-amber-950/20 border-amber-900/40 hover:bg-amber-900/30 text-slate-300'
                            : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-700/60 text-slate-300'
                        }`}
                      >
                        <div className="flex-1 pr-2">
                          <div className="font-semibold flex items-center gap-1.5">
                            <span>{catIcon}</span>
                            <span className="truncate">{landmark.name}</span>
                            {isSubmerged && (
                              <AlertTriangle className="w-3 h-3 text-red-400 shrink-0 inline" />
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {landmark.country} &bull; {landmark.category}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-bold text-[11px]">
                            {landmark.elevation > 0 ? `+${landmark.elevation}m` : `${landmark.elevation}m`}
                          </div>
                          <div
                            className={`text-[9px] font-semibold uppercase ${
                              isSubmerged
                                ? 'text-red-400'
                                : isProtected
                                ? 'text-emerald-400'
                                : isDepression
                                ? 'text-amber-400'
                                : 'text-amber-300'
                            }`}
                          >
                            {isSubmerged
                              ? 'Submerged'
                              : isProtected
                              ? 'Protected'
                              : isDepression
                              ? 'Depression'
                              : 'Safe'}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}

          {/* Tab 3: Country-Level Inundation View */}
          {activeTab === 'countries' && (
            <>
              {/* Existential Inundation Alert Banner */}
              {fullySubmergedCountries.length > 0 && (
                <div className="bg-red-950/80 border border-red-500/80 rounded-xl p-3 shadow-lg shadow-red-950/50">
                  <div className="flex items-center gap-2 font-bold text-red-300 text-xs">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>
                      Existential Inundation: {fullySubmergedCountries.length} {fullySubmergedCountries.length === 1 ? 'Nation' : 'Nations'} Fully Submerged
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] text-red-200/90 leading-relaxed">
                    Sea level (+{seaLevel}m) exceeds highest natural elevation of:{' '}
                    <span className="font-semibold text-white">
                      {fullySubmergedCountries.map((c) => `${c.country.flag} ${c.country.name}`).slice(0, 4).join(', ')}
                      {fullySubmergedCountries.length > 4 ? ` +${fullySubmergedCountries.length - 4} more` : ''}
                    </span>.
                  </p>
                </div>
              )}

              {/* Summary Stats Counters */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-2">
                  <div className="text-lg font-black text-red-400 leading-tight">
                    {fullySubmergedCountries.length}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
                    100% Submerged
                  </div>
                </div>

                <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-2">
                  <div className="text-lg font-black text-amber-400 leading-tight">
                    {affectedCountries.length}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
                    Affected
                  </div>
                </div>

                <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-2">
                  <div className="text-lg font-black text-emerald-400 leading-tight">
                    {islandCountries.length}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
                    Islands
                  </div>
                </div>
              </div>

              {/* Top 5 Humanitarian Displacement Leaderboard */}
              {seaLevel > 0 && topDisplacedCountries.length > 0 && (
                <div className="bg-slate-900/95 border border-cyan-500/30 rounded-xl p-2.5 shadow-md flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-200">
                    <span className="flex items-center gap-1.5 text-cyan-300">
                      <Users className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Top 5 Displaced Populations</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal">at +{seaLevel}m</span>
                  </div>
                  <div className="flex flex-wrap gap-1 text-[10px]">
                    {topDisplacedCountries.map((c, idx) => (
                      <button
                        key={c.country.id}
                        onClick={() => {
                          if (onSelectHotspot) {
                            onSelectHotspot({
                              name: c.country.name,
                              region: c.country.region,
                              lat: c.country.lat,
                              lon: c.country.lon,
                              zoom: c.country.zoom
                            });
                          }
                        }}
                        className="bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white px-2 py-0.5 rounded-md border border-slate-700 transition cursor-pointer flex items-center gap-1"
                        title={`Focus ${c.country.name}: ~${formatPopulation(c.displacedPopulation)} displaced`}
                      >
                        <span className="font-bold text-slate-400">{idx + 1}.</span>
                        <span>{c.country.flag}</span>
                        <span className="font-semibold">{c.country.name}</span>
                        <span className="text-cyan-300 font-bold">({formatPopulation(c.displacedPopulation)})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Sort Toggle Controls */}
              <div className="flex items-center justify-between text-[10px] px-1 text-slate-400">
                <span className="font-semibold text-slate-400">Sort by:</span>
                <div className="flex rounded-lg bg-slate-800 p-0.5 border border-slate-700">
                  <button
                    onClick={() => setCountrySortMode('pop')}
                    className={`px-2.5 py-0.5 rounded-md font-semibold transition ${
                      countrySortMode === 'pop'
                        ? 'bg-cyan-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    👥 Displaced Pop
                  </button>
                  <button
                    onClick={() => setCountrySortMode('land')}
                    className={`px-2.5 py-0.5 rounded-md font-semibold transition ${
                      countrySortMode === 'land'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🌊 Land %
                  </button>
                </div>
              </div>

              {/* Search Input for Countries */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search nation, region, or ISO code..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:border-rose-400 transition"
                />
              </div>

              {/* Country Filter Tabs */}
              <div className="flex rounded-lg bg-slate-800 p-0.5 text-xs border border-slate-700">
                <button
                  onClick={() => setCountryFilterMode('all')}
                  className={`flex-1 py-1 rounded-md font-semibold text-[10px] transition ${
                    countryFilterMode === 'all'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All ({COUNTRIES_LIST.length})
                </button>
                <button
                  onClick={() => setCountryFilterMode('submerged100')}
                  className={`flex-1 py-1 rounded-md font-semibold text-[10px] transition ${
                    countryFilterMode === 'submerged100'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  100% ({fullySubmergedCountries.length})
                </button>
                <button
                  onClick={() => setCountryFilterMode('affected')}
                  className={`flex-1 py-1 rounded-md font-semibold text-[10px] transition ${
                    countryFilterMode === 'affected'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Affected ({affectedCountries.length})
                </button>
                <button
                  onClick={() => setCountryFilterMode('islands')}
                  className={`flex-1 py-1 rounded-md font-semibold text-[10px] transition ${
                    countryFilterMode === 'islands'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Islands ({islandCountries.length})
                </button>
              </div>

              {/* Country List Disclaimer */}
              <div className="text-[10px] text-slate-400 italic px-1 pt-1">
                * National land and population exposure are precomputed hypsometric estimates based on demographic exposure literature.
              </div>

              {/* Country List */}
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                {filteredCountries.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400">
                    {seaLevel === 0 && countryFilterMode === 'submerged100'
                      ? 'At 0m, no sovereign nations are submerged.'
                      : 'No matching sovereign nations found.'}
                  </div>
                ) : (
                  filteredCountries.map((item) => {
                    const { country, isFullySubmerged, landSubmergedPct, popDisplacedPct, displacedPopulation } = item;
                    return (
                      <button
                        key={country.id}
                        onClick={() => {
                          onSelectCity(null);
                          onSelectLandmark(null);
                          if (onSelectHotspot) {
                            onSelectHotspot({
                              name: country.name,
                              region: country.region,
                              lat: country.lat,
                              lon: country.lon,
                              zoom: country.zoom
                            });
                          }
                        }}
                        className={`w-full text-left px-2.5 py-2 rounded-lg border text-xs transition flex flex-col gap-1.5 cursor-pointer ${
                          isFullySubmerged
                            ? 'bg-red-950/40 border-red-500/60 hover:bg-red-900/40 text-red-100 shadow-sm'
                            : landSubmergedPct > 0
                            ? 'bg-slate-800/80 border-slate-700/80 hover:bg-slate-700/80 text-slate-200'
                            : 'bg-slate-850/50 bg-slate-800/40 border-slate-700/40 hover:bg-slate-700/40 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-base shrink-0">{country.flag}</span>
                            <span className="font-bold text-slate-100 truncate">{country.name}</span>
                            <span className="text-[10px] text-slate-400 shrink-0">({country.id})</span>
                            {country.isIslandNation && (
                              <span className="text-[9px] bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 px-1 py-0.2 rounded font-semibold shrink-0">
                                Island
                              </span>
                            )}
                          </div>

                          <div className="text-right shrink-0">
                            {isFullySubmerged ? (
                              <span className="px-1.5 py-0.5 rounded bg-red-600/90 text-white font-black text-[10px] tracking-wide uppercase shadow-sm">
                                100% Submerged
                              </span>
                            ) : countrySortMode === 'pop' ? (
                              <span className="text-[11px] font-black text-cyan-300">
                                {formatPopulation(displacedPopulation)} Pop
                              </span>
                            ) : (
                              <span className="text-[11px] font-black text-rose-300">
                                {landSubmergedPct}% Land
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Land Submerged Progress Bar */}
                        <div className="w-full bg-slate-700/60 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isFullySubmerged
                                ? 'bg-red-500'
                                : landSubmergedPct > 50
                                ? 'bg-rose-500'
                                : landSubmergedPct > 20
                                ? 'bg-amber-500'
                                : 'bg-cyan-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(0, landSubmergedPct))}%` }}
                          />
                        </div>

                        {/* Population Displaced & Natural Elevation Info */}
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <div>
                            {isFullySubmerged ? (
                              <span className="text-red-300 font-semibold">
                                Entire population displaced ({formatPopulation(country.totalPopulation)})
                              </span>
                            ) : countrySortMode === 'pop' ? (
                              <span>
                                {landSubmergedPct}% land submerged ({popDisplacedPct}% pop)
                              </span>
                            ) : displacedPopulation > 0 ? (
                              <span>
                                {formatPopulation(displacedPopulation)} displaced ({popDisplacedPct}%)
                              </span>
                            ) : (
                              <span className="text-slate-500">0 displaced (coastal safe)</span>
                            )}
                          </div>
                          <div className="shrink-0 text-slate-400">
                            Max: <span className="font-semibold text-slate-300">+{country.maxElevation}m</span>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
