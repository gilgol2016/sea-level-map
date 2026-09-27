import { useState, useEffect, useRef } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { MapView } from './components/Map';
import { Controls } from './components/Controls';
import { CityStats } from './components/CityStats';
import { DidYouKnowCard } from './components/DidYouKnowCard';
import { InfoModal } from './components/InfoModal';
import { SanityCheckModal } from './components/SanityCheckModal';
import { City, Landmark, Hotspot } from './types';
import rawCities from './data/cities.json';
import rawLandmarks from './data/landmarks.json';
import { Waves, Info, ShieldCheck, Share2, Check, Camera, Loader2, GripHorizontal, Sliders, BarChart3, Lightbulb, RotateCcw, Sparkles, Pause, Play, Menu, ChevronDown, ChevronUp } from 'lucide-react';
import { parseScenarioParams, serializeScenarioParams } from './utils/urlState';
import { captureMapSnapshot } from './utils/snapshotExporter';
import { useDraggable } from './utils/useDraggable';
import { MobileDrawer, MobileTab } from './components/MobileDrawer';
import { RangeMode, PlaybackSpeed } from './components/Controls';

const CITIES: City[] = rawCities as City[];
const LANDMARKS: Landmark[] = rawLandmarks as Landmark[];

export function App() {
  const initialParams = parseScenarioParams(window.location.search);

  const [seaLevel, setSeaLevel] = useState<number>(initialParams.seaLevel);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [activeTab, setActiveTab] = useState<'cities' | 'landmarks' | 'countries'>(initialParams.tab);
  const [viewport, setViewport] = useState<{ lat: number; lon: number; zoom: number } | null>(
    initialParams.lat !== null && initialParams.lon !== null && initialParams.zoom !== null
      ? { lat: initialParams.lat, lon: initialParams.lon, zoom: initialParams.zoom }
      : null
  );
  const [shareToast, setShareToast] = useState<boolean>(false);
  const [snapshotToast, setSnapshotToast] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<boolean>(false);
  const mapInstanceRef = useRef<MapLibreMap | null>(null);

  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [selectedLandmark, setSelectedLandmark] = useState<Landmark | null>(null);
  const [showCities, setShowCities] = useState<boolean>(true);
  const [showLandmarks, setShowLandmarks] = useState<boolean>(true);
  const [targetHotspot, setTargetHotspot] = useState<Hotspot | null>(null);
  const [isInfoOpen, setIsInfoOpen] = useState<boolean>(false);
  const [isSanityOpen, setIsSanityOpen] = useState<boolean>(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('controls');
  const [desktopTab, setDesktopTab] = useState<'controls' | 'stats' | 'facts'>('controls');
  const [isPanelCollapsed, setIsPanelCollapsed] = useState<boolean>(false);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [rangeMode, setRangeMode] = useState<RangeMode>(
    initialParams.seaLevel > 100 ? 'extreme' : 'coastal'
  );
  const [isPrecision, setIsPrecision] = useState<boolean>(false); // Default: 1m precision (not 0.5m)

  // Draggable hooks for desktop floating panels (in-memory, resets on reload)
  const headerDrag = useDraggable();
  const panelDrag = useDraggable();

  // Debounced URL synchronization for scenario sharing
  useEffect(() => {
    const timer = setTimeout(() => {
      const search = serializeScenarioParams(seaLevel, viewport, activeTab);
      const newUrl = search ? `${window.location.pathname}?${search}` : window.location.pathname;
      window.history.replaceState(null, '', newUrl);
    }, 250);
    return () => clearTimeout(timer);
  }, [seaLevel, viewport, activeTab]);

  // Auto-play timeline simulation loop
  const seaLevelRef = useRef(seaLevel);
  seaLevelRef.current = seaLevel;

  useEffect(() => {
    if (!isPlaying) return;

    const intervalMs =
      rangeMode === 'extreme'
        ? (playbackSpeed === 1 ? 400 : playbackSpeed === 2 ? 200 : 100)
        : (playbackSpeed === 1 ? 250 : playbackSpeed === 2 ? 120 : 60);

    const maxLimit = rangeMode === 'coastal' ? 100 : 1000;

    const timer = setInterval(() => {
      const current = seaLevelRef.current;
      if (current >= maxLimit) {
        setIsPlaying(false);
        return;
      }

      let nextVal = current;
      if (rangeMode === 'extreme') {
        nextVal = Math.min(maxLimit, Math.floor(current / 50) * 50 + 50);
      } else {
        if (current < 10 && isPrecision) {
          nextVal = Math.min(maxLimit, current + 0.5);
        } else {
          nextVal = Math.min(maxLimit, current + 1);
        }
      }

      setSeaLevel(nextVal);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, rangeMode, isPrecision]);

  // Close menu on click outside
  useEffect(() => {
    const handleOutsideClick = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('pointerdown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick);
    };
  }, [isMenuOpen]);

  // Global keyboard ergonomics: Esc to close modals/deselect, Arrow keys to nudge sea level, Space to Play/Pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not intercept if user is typing in a search or text input
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
        return;
      }

      if (e.key === 'Escape') {
        if (isMenuOpen) {
          setIsMenuOpen(false);
          return;
        }
        if (isInfoOpen) {
          setIsInfoOpen(false);
          return;
        }
        if (isSanityOpen) {
          setIsSanityOpen(false);
          return;
        }
        if (isMobileDrawerOpen) {
          setIsMobileDrawerOpen(false);
          return;
        }
        if (selectedCity) {
          setSelectedCity(null);
          return;
        }
        if (selectedLandmark) {
          setSelectedLandmark(null);
          return;
        }
      }

      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIsPlaying(false);
        setSeaLevel((prev) => {
          if (rangeMode === 'extreme') {
            return Math.min(1000, Math.floor(prev / 50) * 50 + 50);
          }
          const step = isPrecision && prev < 10 ? 0.5 : 1;
          return Math.min(100, prev + step);
        });
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsPlaying(false);
        setSeaLevel((prev) => {
          if (rangeMode === 'extreme') {
            return Math.max(0, Math.ceil(prev / 50) * 50 - 50);
          }
          const step = isPrecision && prev <= 10 ? 0.5 : 1;
          return Math.max(0, prev - step);
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isInfoOpen, isSanityOpen, isMobileDrawerOpen, selectedCity, selectedLandmark, rangeMode, isPrecision]);

  const handleShareScenario = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      const dummy = document.createElement('input');
      dummy.value = window.location.href;
      document.body.appendChild(dummy);
      dummy.select();
      document.execCommand('copy');
      document.body.removeChild(dummy);
    }
    setShareToast(true);
    setTimeout(() => setShareToast(false), 2500);
  };

  const handleExportSnapshot = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const submergedCount = CITIES.filter(c => c.elevation <= seaLevel && c.elevation > 0).length;
      const res = await captureMapSnapshot(mapInstanceRef.current, seaLevel, undefined, submergedCount);
      setExportSuccess(true);
      if (res?.copiedToClipboard) {
        setSnapshotToast('Snapshot copied to clipboard! Press Ctrl+V to paste.');
      } else {
        setSnapshotToast('Snapshot image saved to Downloads folder!');
      }
      setTimeout(() => {
        setExportSuccess(false);
        setSnapshotToast(null);
      }, 3500);
    } catch (err) {
      console.error('Failed to export map snapshot:', err);
      setSnapshotToast('Snapshot export failed. Please try again.');
      setTimeout(() => setSnapshotToast(null), 3000);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSelectHotspot = (hotspot: Hotspot) => {
    setIsPlaying(false);
    setSelectedCity(null);
    setSelectedLandmark(null);
    setTargetHotspot(hotspot);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden font-sans bg-slate-950 text-slate-100 select-none">
      {/* Background Map Component */}
      <div className="absolute inset-0 z-0">
        <MapView
          seaLevel={seaLevel}
          cities={CITIES}
          landmarks={LANDMARKS}
          showCities={showCities}
          showLandmarks={showLandmarks}
          selectedCity={selectedCity}
          onSelectCity={setSelectedCity}
          selectedLandmark={selectedLandmark}
          onSelectLandmark={setSelectedLandmark}
          targetHotspot={targetHotspot}
          initialCenter={
            initialParams.lat !== null && initialParams.lon !== null
              ? [initialParams.lon, initialParams.lat]
              : undefined
          }
          initialZoom={initialParams.zoom !== null ? initialParams.zoom : undefined}
          onViewportChange={setViewport}
          onMapReady={(map) => {
            mapInstanceRef.current = map;
          }}
        />
      </div>

      {/* Top Navbar */}
      <header className="absolute top-0 left-0 right-0 z-20 pointer-events-none p-4 flex justify-between items-center">
        {/* Brand Header: Minimal, clean, no "Phase 2" badge or subtitle */}
        <div
          ref={headerDrag.targetRef}
          style={headerDrag.style}
          onPointerDown={headerDrag.handlePointerDown}
          className="pointer-events-auto bg-slate-900/90 backdrop-blur-md border border-slate-700/60 rounded-xl px-3.5 py-2 shadow-xl flex items-center gap-2.5 cursor-grab active:cursor-grabbing select-none"
        >
          <div className="hidden sm:flex text-slate-500 hover:text-slate-300">
            <GripHorizontal className="w-3.5 h-3.5" />
          </div>
          <div className="p-1.5 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-500 text-white shadow-md shadow-cyan-500/20">
            <Waves className="w-4 h-4" />
          </div>
          <span className="text-sm font-bold tracking-tight text-white">
            Global Sea Level Explorer
          </span>
        </div>

        {/* Top Right Action Menu Dropdown */}
        <div className="relative pointer-events-auto" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/60 rounded-xl px-3 py-2 shadow-xl backdrop-blur-md text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
            aria-expanded={isMenuOpen}
            aria-haspopup="true"
          >
            <Menu className="w-4 h-4 text-cyan-400" />
            <span>Menu</span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu Modal / Popover */}
          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl p-1.5 flex flex-col gap-1 z-30 animate-fade-in text-xs font-medium">
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  handleExportSnapshot();
                }}
                disabled={isExporting}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-200 hover:text-white flex items-center gap-2.5 transition cursor-pointer disabled:opacity-50"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                ) : exportSuccess ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Camera className="w-4 h-4 text-sky-400" />
                )}
                <span>{isExporting ? 'Exporting...' : exportSuccess ? 'Copied & Saved!' : 'Snapshot'}</span>
              </button>

              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  handleShareScenario();
                }}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-200 hover:text-white flex items-center gap-2.5 transition cursor-pointer"
              >
                <Share2 className="w-4 h-4 text-cyan-400" />
                <span>Share Scenario</span>
              </button>

              <div className="my-1 border-t border-slate-800" />

              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  setIsSanityOpen(true);
                }}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-200 hover:text-white flex items-center justify-between transition cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Sanity Tests</span>
                </div>
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-1.5 py-0.2 rounded-full border border-emerald-500/30">
                  Passed
                </span>
              </button>

              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  setIsInfoOpen(true);
                }}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-200 hover:text-white flex items-center gap-2.5 transition cursor-pointer"
              >
                <Info className="w-4 h-4 text-cyan-400" />
                <span>About Model</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Unified Floating Explorer Panel (Desktop md:flex) */}
      <div
        ref={panelDrag.targetRef}
        style={panelDrag.style}
        className="absolute top-[72px] left-4 z-20 pointer-events-auto hidden md:flex flex-col bg-slate-900/95 backdrop-blur-md border border-slate-700/70 rounded-2xl shadow-2xl w-84 lg:w-92 xl:w-96 max-h-[calc(100vh-6rem)] overflow-hidden font-sans transition-all duration-200"
      >
        {/* Panel Header & Navigation Tabs */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-950/80 border-b border-slate-800 select-none">
          {/* Drag Handle + Title */}
          <div
            onPointerDown={panelDrag.handlePointerDown}
            className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-200"
            title="Drag panel to reposition"
          >
            <GripHorizontal className="w-4 h-4 text-slate-500" />
          </div>

          {/* Mode Tabs */}
          <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-xl border border-slate-800">
            <button
              onClick={() => {
                setDesktopTab('controls');
                setIsPanelCollapsed(false);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                desktopTab === 'controls' && !isPanelCollapsed
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Sea level controls & simulation"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Controls</span>
            </button>

            <button
              onClick={() => {
                setDesktopTab('stats');
                setIsPanelCollapsed(false);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                desktopTab === 'stats' && !isPanelCollapsed
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Impact statistics and city tracking"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Impact</span>
            </button>

            <button
              onClick={() => {
                setDesktopTab('facts');
                setIsPanelCollapsed(false);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                desktopTab === 'facts' && !isPanelCollapsed
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Curated geographical insights"
            >
              <Lightbulb className="w-3.5 h-3.5" />
              <span>Facts</span>
            </button>
          </div>

          {/* Live Sea Level Badge & Collapse Button */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-baseline gap-0.5 bg-slate-800/90 px-2 py-0.5 rounded-lg border border-slate-700">
              <span className="text-xs font-black text-cyan-400">
                +{seaLevel % 1 !== 0 ? seaLevel.toFixed(1) : seaLevel.toLocaleString()}
              </span>
              <span className="text-[10px] font-semibold text-slate-400">m</span>
            </div>

            <button
              onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title={isPanelCollapsed ? "Expand explorer panel" : "Minimize explorer panel"}
              aria-label={isPanelCollapsed ? "Expand explorer panel" : "Minimize explorer panel"}
              aria-expanded={!isPanelCollapsed}
            >
              {isPanelCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Panel Content Body */}
        {!isPanelCollapsed && (
          <div className="p-3.5 overflow-y-auto max-h-[calc(100vh-10rem)] custom-scrollbar">
            {desktopTab === 'controls' && (
              <Controls
                seaLevel={seaLevel}
                onSeaLevelChange={(val) => {
                  setIsPlaying(false);
                  setSeaLevel(val);
                }}
                onSelectHotspot={handleSelectHotspot}
                rangeMode={rangeMode}
                onRangeModeChange={setRangeMode}
                isPrecision={isPrecision}
                onPrecisionChange={setIsPrecision}
                isPlaying={isPlaying}
                onTogglePlay={setIsPlaying}
                playbackSpeed={playbackSpeed}
                onPlaybackSpeedChange={setPlaybackSpeed}
                embedded={true}
                hideHeader={true}
              />
            )}

            {desktopTab === 'stats' && (
              <CityStats
                cities={CITIES}
                landmarks={LANDMARKS}
                seaLevel={seaLevel}
                selectedCity={selectedCity}
                onSelectCity={setSelectedCity}
                selectedLandmark={selectedLandmark}
                onSelectLandmark={setSelectedLandmark}
                showCities={showCities}
                onToggleShowCities={() => setShowCities(!showCities)}
                showLandmarks={showLandmarks}
                onToggleShowLandmarks={() => setShowLandmarks(!showLandmarks)}
                onOpenSanityModal={() => setIsSanityOpen(true)}
                onSelectHotspot={handleSelectHotspot}
                activeTab={activeTab}
                onActiveTabChange={setActiveTab}
                embedded={true}
                hideHeader={true}
              />
            )}

            {desktopTab === 'facts' && (
              <DidYouKnowCard
                seaLevel={seaLevel}
                forceExpanded={true}
                embedded={true}
              />
            )}
          </div>
        )}
      </div>

      {/* Mobile Bottom Thumb Bar (< 768px) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-3.5 py-2 shadow-2xl flex flex-col gap-2">
        {/* Top row: Level Badge, Mode Toggle, Precision Toggle & 0m Reset */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <div className="flex items-baseline gap-1 bg-slate-800 px-2.5 py-1 rounded-xl border border-slate-700 shrink-0">
              <span className="text-base font-black text-cyan-400">
                +{seaLevel % 1 !== 0 ? seaLevel.toFixed(1) : seaLevel.toLocaleString()}
              </span>
              <span className="text-[10px] font-semibold text-slate-400">m</span>
            </div>

            {/* Mode Toggle Button */}
            <button
              onClick={() => {
                if (isPlaying) setIsPlaying(false);
                if (rangeMode === 'coastal') {
                  setRangeMode('extreme');
                  const snapped = Math.round(seaLevel / 50) * 50;
                  setSeaLevel(Math.max(0, Math.min(1000, snapped)));
                } else {
                  setRangeMode('coastal');
                  if (seaLevel > 100) setSeaLevel(100);
                }
              }}
              className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition cursor-pointer ${
                rangeMode === 'extreme'
                  ? 'bg-purple-950/80 border-purple-500/50 text-purple-300'
                  : 'bg-cyan-950/80 border-cyan-500/50 text-cyan-300'
              }`}
              title="Toggle between Coastal (0–100m) and Extreme (0–1,000m)"
            >
              {rangeMode === 'extreme' ? 'Extreme (1,000m)' : 'Coastal (100m)'}
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Permanent Auto-Play / Pause Button on mobile */}
            <button
              onClick={() => {
                const maxLimit = rangeMode === 'coastal' ? 100 : 1000;
                if (!isPlaying && seaLevel >= maxLimit) {
                  setSeaLevel(0);
                }
                setIsPlaying(!isPlaying);
              }}
              className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border transition cursor-pointer shrink-0 shadow-md ${
                isPlaying
                  ? 'bg-amber-500 text-slate-950 border-amber-400 ring-2 ring-amber-400/40 animate-pulse'
                  : 'bg-cyan-500 text-slate-950 border-cyan-400 hover:bg-cyan-400'
              }`}
              title={isPlaying ? "Pause simulation" : "Auto-Play sea level rise"}
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3 h-3 fill-current" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-current" />
                  <span>Play</span>
                </>
              )}
            </button>

            {/* Coastal Precision Switch: Default 1m step, optional 0.5m */}
            {rangeMode === 'coastal' ? (
              <button
                onClick={() => setIsPrecision(!isPrecision)}
                className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition cursor-pointer flex items-center gap-1 ${
                  isPrecision
                    ? 'bg-cyan-950/80 border-cyan-500/60 text-cyan-300'
                    : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
                title="Toggle between 1m precision (default) and 0.5m fine precision"
              >
                <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
                <span>{isPrecision ? '0.5m' : '1m Step'}</span>
              </button>
            ) : (
              <span className="text-[10px] font-bold px-2 py-1 rounded-lg border border-purple-500/40 bg-purple-950/50 text-purple-300">
                50m Step
              </span>
            )}

            {/* Quick Reset to 0m Baseline */}
            {seaLevel > 0 && (
              <button
                onClick={() => {
                  if (isPlaying) setIsPlaying(false);
                  setSeaLevel(0);
                }}
                className="p-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                title="Reset to 0m baseline"
              >
                <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
              </button>
            )}
          </div>
        </div>

        {/* Mobile Scale Slider */}
        <div className="w-full flex items-center gap-2">
          <input
            type="range"
            min="0"
            max={rangeMode === 'extreme' ? 1000 : 100}
            step={rangeMode === 'extreme' ? 50 : (isPrecision && seaLevel < 10 ? 0.5 : 1)}
            value={seaLevel}
            onChange={(e) => {
              if (isPlaying) setIsPlaying(false);
              const val = parseFloat(e.target.value);
              if (isNaN(val) || val <= 0.05) {
                setSeaLevel(0);
              } else if (rangeMode === 'extreme') {
                setSeaLevel(Math.min(1000, Math.max(0, Math.round(val / 50) * 50)));
              } else if (isPrecision && val < 10) {
                setSeaLevel(Math.min(100, Math.max(0, Math.round(val * 2) / 2)));
              } else {
                setSeaLevel(Math.min(100, Math.max(0, Math.round(val))));
              }
            }}
            className="w-full accent-cyan-400 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => {
              setMobileTab('controls');
              setIsMobileDrawerOpen(true);
            }}
            className="bg-slate-800/90 hover:bg-slate-700 border border-slate-700 rounded-xl py-2 px-2 text-xs font-semibold text-cyan-300 flex items-center justify-center gap-1.5 shadow active:scale-95 transition cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Controls</span>
          </button>

          <button
            onClick={() => {
              setMobileTab('stats');
              setIsMobileDrawerOpen(true);
            }}
            className="bg-slate-800/90 hover:bg-slate-700 border border-slate-700 rounded-xl py-2 px-2 text-xs font-semibold text-cyan-300 flex items-center justify-center gap-1.5 shadow active:scale-95 transition cursor-pointer"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Stats</span>
          </button>

          <button
            onClick={() => {
              setMobileTab('facts');
              setIsMobileDrawerOpen(true);
            }}
            className="bg-slate-800/90 hover:bg-slate-700 border border-slate-700 rounded-xl py-2 px-2 text-xs font-semibold text-amber-300 flex items-center justify-center gap-1.5 shadow active:scale-95 transition cursor-pointer"
          >
            <Lightbulb className="w-3.5 h-3.5" />
            <span>Facts</span>
          </button>
        </div>
      </div>

      {/* Mobile Slide-Up Bottom Sheet Drawer (< 768px) */}
      <MobileDrawer
        isOpen={isMobileDrawerOpen}
        onClose={() => setIsMobileDrawerOpen(false)}
        activeTab={mobileTab}
        onTabChange={setMobileTab}
      >
        {mobileTab === 'controls' && (
          <div className="w-full max-w-md p-1">
            <Controls
              seaLevel={seaLevel}
              onSeaLevelChange={(val) => {
                setIsPlaying(false);
                setSeaLevel(val);
              }}
              onSelectHotspot={(hotspot) => {
                handleSelectHotspot(hotspot);
                setIsMobileDrawerOpen(false);
              }}
              rangeMode={rangeMode}
              onRangeModeChange={setRangeMode}
              isPrecision={isPrecision}
              onPrecisionChange={setIsPrecision}
              isPlaying={isPlaying}
              onTogglePlay={setIsPlaying}
              playbackSpeed={playbackSpeed}
              onPlaybackSpeedChange={setPlaybackSpeed}
              onAutoPlayStart={() => {
                // Automatically hide/close the panel so the user can see the animated map rise immediately!
                setIsMobileDrawerOpen(false);
              }}
              embedded={true}
              hideHeader={true}
            />
          </div>
        )}

        {mobileTab === 'stats' && (
          <div className="w-full max-w-md p-1">
            <CityStats
              cities={CITIES}
              landmarks={LANDMARKS}
              seaLevel={seaLevel}
              selectedCity={selectedCity}
              onSelectCity={(c) => {
                setSelectedCity(c);
                setIsMobileDrawerOpen(false);
              }}
              selectedLandmark={selectedLandmark}
              onSelectLandmark={(l) => {
                setSelectedLandmark(l);
                setIsMobileDrawerOpen(false);
              }}
              showCities={showCities}
              onToggleShowCities={() => setShowCities(!showCities)}
              showLandmarks={showLandmarks}
              onToggleShowLandmarks={() => setShowLandmarks(!showLandmarks)}
              onOpenSanityModal={() => {
                setIsMobileDrawerOpen(false);
                setIsSanityOpen(true);
              }}
              onSelectHotspot={(h) => {
                handleSelectHotspot(h);
                setIsMobileDrawerOpen(false);
              }}
              activeTab={activeTab}
              onActiveTabChange={setActiveTab}
              embedded={true}
              hideHeader={true}
            />
          </div>
        )}

        {mobileTab === 'facts' && (
          <div className="w-full max-w-md p-1">
            <DidYouKnowCard
              seaLevel={seaLevel}
              forceExpanded={true}
              embedded={true}
            />
          </div>
        )}
      </MobileDrawer>

      {/* Share Scenario Toast Notification */}
      {shareToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border border-cyan-500/80 text-cyan-100 px-4 py-2 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-2 text-xs font-bold animate-fade-in pointer-events-none">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>Scenario link copied to clipboard!</span>
        </div>
      )}

      {/* Snapshot Toast Notification */}
      {snapshotToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border border-sky-400/80 text-sky-100 px-4 py-2.5 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-2.5 text-xs font-bold animate-fade-in pointer-events-none">
          <Camera className="w-4 h-4 text-sky-400 shrink-0" />
          <span>{snapshotToast}</span>
        </div>
      )}

      {/* Bottom Floating Disclaimer & Probe Tip */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none hidden md:block">
        <div className="pointer-events-auto bg-slate-900/85 backdrop-blur-md border border-slate-800 px-4 py-1.5 rounded-full shadow-lg text-[11px] text-slate-400 text-center flex items-center gap-2">
          <span>Bathtub elevation model &bull; <code className="text-cyan-400 font-mono">0 &lt; elevation &le; +{seaLevel % 1 !== 0 ? seaLevel.toFixed(1) : seaLevel.toLocaleString()}m</code> &bull; Preserves dry depressions</span>
          <span className="text-slate-600">&bull;</span>
          <span className="text-cyan-300 font-medium">💡 Click anywhere on map to probe elevation &amp; depth</span>
        </div>
      </div>

      {/* Modals */}
      <InfoModal isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />
      <SanityCheckModal isOpen={isSanityOpen} onClose={() => setIsSanityOpen(false)} />
    </div>
  );
}

export default App;
