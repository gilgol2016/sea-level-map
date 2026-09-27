import React, { useState, useEffect, useRef } from 'react';
import { Waves, ChevronLeft, ChevronRight, Navigation, RotateCcw, Play, Pause, Gauge, Sparkles, Layers, ChevronDown, ChevronUp, GripHorizontal } from 'lucide-react';
import { Hotspot } from '../types';

export type RangeMode = 'coastal' | 'extreme';
export type PlaybackSpeed = 1 | 2 | 4;

interface ControlsProps {
  seaLevel: number;
  onSeaLevelChange: (val: number) => void;
  onSelectHotspot: (hotspot: Hotspot) => void;
  onDragStart?: (e: React.PointerEvent) => void;
  rangeMode?: RangeMode;
  onRangeModeChange?: (mode: RangeMode) => void;
  isPrecision?: boolean;
  onPrecisionChange?: (precision: boolean) => void;
  isPlaying?: boolean;
  onTogglePlay?: (playing: boolean) => void;
  playbackSpeed?: PlaybackSpeed;
  onPlaybackSpeedChange?: (spd: PlaybackSpeed) => void;
  onAutoPlayStart?: () => void;
}

const COASTAL_PRESETS = [
  { level: 0, label: '0m', desc: "Today's baseline" },
  { level: 1, label: '+1m', desc: 'Maldives, Venice, Key West' },
  { level: 2, label: '+2m', desc: 'Miami, Alexandria, Bangkok' },
  { level: 5, label: '+5m', desc: 'Shanghai, New Orleans, Copenhagen' },
  { level: 10, label: '+10m', desc: 'NYC, London, Mumbai, Tokyo Bay' },
  { level: 25, label: '+25m', desc: 'Severe global coastal displacement' },
  { level: 66, label: '+66m', desc: 'All Earth ice sheets melted' },
  { level: 100, label: '+100m', desc: 'Coastal threshold maximum' }
];

const EXTREME_PRESETS = [
  { level: 0, label: '0m', desc: "Today's baseline" },
  { level: 50, label: '+50m', desc: 'Major coastal plains submerged' },
  { level: 100, label: '+100m', desc: 'Continental shelf threshold' },
  { level: 200, label: '+200m', desc: 'Continental lowlands submerged' },
  { level: 350, label: '+350m', desc: 'Major river valleys inundated' },
  { level: 500, label: '+500m', desc: 'Major river basins & plateaus' },
  { level: 700, label: '+700m', desc: 'High interior plains & Madrid' },
  { level: 1000, label: '+1,000m', desc: 'Hypothetical deluge limit' }
];

const HOTSPOTS: Hotspot[] = [
  { name: 'Global', region: 'World', lat: 20, lon: 15, zoom: 2.2 },
  { name: 'Eastern Mediterranean', region: 'Middle East', lat: 31.8, lon: 34.8, zoom: 7.4 },
  { name: 'Netherlands & Low Countries', region: 'Europe', lat: 52.3, lon: 4.9, zoom: 7.2 },
  { name: 'Florida & Gulf Coast', region: 'North America', lat: 26.5, lon: -81.5, zoom: 6.8 },
  { name: 'Ganges Delta & Bangladesh', region: 'South Asia', lat: 23.5, lon: 90.0, zoom: 7.0 },
  { name: 'Shanghai & Yangtze Delta', region: 'East Asia', lat: 31.5, lon: 121.5, zoom: 7.2 },
  { name: 'Nile Delta & Alexandria', region: 'North Africa', lat: 31.0, lon: 31.0, zoom: 7.5 }
];

export const Controls: React.FC<ControlsProps> = ({
  seaLevel,
  onSeaLevelChange,
  onSelectHotspot,
  onDragStart,
  rangeMode: rangeModeProp,
  onRangeModeChange,
  isPrecision: isPrecisionProp,
  onPrecisionChange,
  isPlaying: isPlayingProp,
  onTogglePlay,
  playbackSpeed: playbackSpeedProp,
  onPlaybackSpeedChange,
  onAutoPlayStart
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [internalRangeMode, setInternalRangeMode] = useState<RangeMode>('coastal');
  const [internalPrecision, setInternalPrecision] = useState<boolean>(false); // Default: 1m precision
  const [internalIsPlaying, setInternalIsPlaying] = useState<boolean>(false);
  const [internalPlaybackSpeed, setInternalPlaybackSpeed] = useState<PlaybackSpeed>(1);

  const rangeMode = rangeModeProp ?? internalRangeMode;
  const setRangeMode = onRangeModeChange ?? setInternalRangeMode;

  const isPrecision = isPrecisionProp ?? internalPrecision;
  const setIsPrecision = onPrecisionChange ?? setInternalPrecision;

  const isPlaying = isPlayingProp ?? internalIsPlaying;
  const setIsPlaying = onTogglePlay ?? setInternalIsPlaying;

  const playbackSpeed = playbackSpeedProp ?? internalPlaybackSpeed;
  const setPlaybackSpeed = onPlaybackSpeedChange ?? setInternalPlaybackSpeed;

  // Auto-play timeline loop
  const seaLevelRef = useRef(seaLevel);
  seaLevelRef.current = seaLevel;

  useEffect(() => {
    // If parent controls auto-play, parent manages the interval timer
    if (isPlayingProp !== undefined) return;
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
        // In Extreme mode: strictly 50m milestone steps from 0m to 1000m
        nextVal = Math.min(maxLimit, Math.floor(current / 50) * 50 + 50);
      } else {
        // Coastal mode: 0.5m below 10m if precision, else 1m
        if (current < 10 && isPrecision) {
          nextVal = Math.min(maxLimit, current + 0.5);
        } else {
          nextVal = Math.min(maxLimit, current + 1);
        }
      }

      onSeaLevelChange(nextVal);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, rangeMode, isPrecision, onSeaLevelChange]);

  // Handle slider input
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsPlaying(false);
    const val = parseFloat(e.target.value);
    if (rangeMode === 'extreme') {
      // Strictly snap to 50m milestones
      onSeaLevelChange(Math.round(val / 50) * 50);
    } else {
      onSeaLevelChange(val);
    }
  };

  // Step buttons
  const stepCoastal = (delta: number) => {
    setIsPlaying(false);
    const next = Math.max(0, Math.min(100, seaLevel + delta));
    onSeaLevelChange(next);
  };

  const stepExtreme = (delta: number) => {
    setIsPlaying(false);
    const base = Math.round(seaLevel / 50) * 50;
    const next = Math.max(0, Math.min(1000, base + delta));
    onSeaLevelChange(next);
  };

  // Switch to coastal mode
  const handleSwitchToCoastal = () => {
    setIsPlaying(false);
    setRangeMode('coastal');
    if (seaLevel > 100) {
      onSeaLevelChange(100);
    }
  };

  // Switch to extreme mode
  const handleSwitchToExtreme = () => {
    setIsPlaying(false);
    setRangeMode('extreme');
    // Snap current value to nearest 50m milestone
    const snapped = Math.round(seaLevel / 50) * 50;
    onSeaLevelChange(Math.max(0, Math.min(1000, snapped)));
  };

  const formattedLevel =
    seaLevel % 1 !== 0 ? seaLevel.toFixed(1) : seaLevel.toLocaleString();

  return (
    <div className={`bg-slate-900/90 backdrop-blur-md border border-slate-700/60 rounded-2xl ${isCollapsed ? 'p-4' : 'p-5'} shadow-2xl text-slate-100 flex flex-col gap-3.5 max-w-md w-full transition-all duration-200`}>
      {/* Header with Title & Level Badge */}
      <div
        onPointerDown={onDragStart}
        className={`flex items-center justify-between ${onDragStart ? 'cursor-grab active:cursor-grabbing select-none' : ''}`}
      >
        <div className="flex items-center gap-2.5">
          {onDragStart && (
            <div className="hidden sm:flex text-slate-500 hover:text-slate-300">
              <GripHorizontal className="w-4 h-4" />
            </div>
          )}
          <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <Waves className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white leading-tight">
              Sea Level Control
            </h1>
            <p className="text-xs text-slate-400">
              {rangeMode === 'coastal'
                ? 'Coastal elevation model (0–100m)'
                : 'Extreme deluge model (0–1,000m, 50m steps)'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-baseline gap-1 bg-slate-800/80 px-3.5 py-1.5 rounded-xl border border-slate-700">
            <span className="text-2xl font-black tracking-tight text-cyan-400">
              +{formattedLevel}
            </span>
            <span className="text-xs font-semibold text-slate-400">meters</span>
          </div>

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title={isCollapsed ? "Expand sea level controls" : "Minimize sea level controls"}
            aria-label={isCollapsed ? "Expand sea level controls" : "Minimize sea level controls"}
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Mode Selector & Precision / Step Indicator */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800 text-xs">
        {/* Coastal vs Extreme Tabs */}
        <div className="flex rounded-lg bg-slate-950/70 p-0.5 border border-slate-800">
          <button
            onClick={handleSwitchToCoastal}
            className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
              rangeMode === 'coastal'
                ? 'bg-cyan-500/80 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Coastal (0–100m)
          </button>
          <button
            onClick={handleSwitchToExtreme}
            className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
              rangeMode === 'extreme'
                ? 'bg-purple-600/80 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Extreme (0–1,000m)
          </button>
        </div>

        {/* Coastal Precision Switch or Extreme 50m Badge */}
        {rangeMode === 'coastal' ? (
          <button
            onClick={() => setIsPrecision(!isPrecision)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border font-semibold transition text-xs cursor-pointer ${
              isPrecision
                ? 'bg-cyan-950/70 border-cyan-500/50 text-cyan-300'
                : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Enable 0.5m fine precision steps for the vulnerable 0-10m range"
          >
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>0.5m Precision</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-purple-500/40 bg-purple-950/50 text-purple-300 text-xs font-semibold">
            <Layers className="w-3 h-3 text-purple-400" />
            <span>50m Steps</span>
          </div>
        )}
      </div>

      {/* Proportional Range Slider */}
      <div className="space-y-1.5">
        {rangeMode === 'coastal' ? (
          <>
            <div className="flex justify-between text-xs text-slate-400 font-medium">
              <span>0m</span>
              <span>25m</span>
              <span>50m</span>
              <span>75m</span>
              <span>100m</span>
            </div>

            <input
              type="range"
              min={0}
              max={100}
              step={isPrecision && seaLevel <= 10 ? 0.5 : 1}
              value={seaLevel}
              onChange={handleSliderChange}
              aria-label="Coastal sea level in meters"
              className="w-full h-2.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400 hover:accent-cyan-300 transition-all"
            />

            {/* Coastal Step Buttons */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex gap-1.5">
                <button
                  onClick={() => stepCoastal(-5)}
                  disabled={seaLevel <= 0}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 transition cursor-pointer"
                  title="Decrease by 5m"
                >
                  -5m
                </button>
                <button
                  onClick={() => stepCoastal(isPrecision && seaLevel <= 10 ? -0.5 : -1)}
                  disabled={seaLevel <= 0}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 flex items-center gap-0.5 transition cursor-pointer"
                  title="Decrease by 1m (or 0.5m)"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>{isPrecision && seaLevel <= 10 ? '-0.5m' : '-1m'}</span>
                </button>
              </div>

              <button
                onClick={() => {
                  setIsPlaying(false);
                  onSeaLevelChange(0);
                }}
                disabled={seaLevel === 0}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 flex items-center gap-1 text-slate-300 transition cursor-pointer"
                title="Reset to today's sea level (0m)"
              >
                <RotateCcw className="w-3 h-3" /> Reset (0m)
              </button>

              <div className="flex gap-1.5">
                <button
                  onClick={() => stepCoastal(isPrecision && seaLevel < 10 ? 0.5 : 1)}
                  disabled={seaLevel >= 100}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 flex items-center gap-0.5 transition cursor-pointer"
                  title="Increase by 1m (or 0.5m)"
                >
                  <span>{isPrecision && seaLevel < 10 ? '+0.5m' : '+1m'}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => stepCoastal(5)}
                  disabled={seaLevel >= 100}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 transition cursor-pointer"
                  title="Increase by 5m"
                >
                  +5m
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Extreme Proportional Scale: 0 to 1,000m with 50m Steps */}
            <div className="flex justify-between text-xs text-purple-300/80 font-medium">
              <span>0m</span>
              <span>250m</span>
              <span>500m</span>
              <span>750m</span>
              <span>1,000m</span>
            </div>

            <input
              type="range"
              min={0}
              max={1000}
              step={50}
              value={Math.round(seaLevel / 50) * 50}
              onChange={handleSliderChange}
              aria-label="Extreme sea level in meters"
              className="w-full h-2.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500 hover:accent-purple-400 transition-all"
            />

            {/* Extreme 50m Step Buttons */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex gap-1.5">
                <button
                  onClick={() => stepExtreme(-100)}
                  disabled={seaLevel <= 0}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 transition cursor-pointer"
                  title="Decrease by 100m"
                >
                  -100m
                </button>
                <button
                  onClick={() => stepExtreme(-50)}
                  disabled={seaLevel <= 0}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 flex items-center gap-0.5 transition cursor-pointer text-purple-300"
                  title="Decrease by 50m milestone"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> -50m
                </button>
              </div>

              <button
                onClick={() => {
                  setIsPlaying(false);
                  onSeaLevelChange(0);
                }}
                disabled={seaLevel === 0}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 flex items-center gap-1 text-slate-300 transition cursor-pointer"
                title="Reset to today's sea level (0m)"
              >
                <RotateCcw className="w-3 h-3" /> Reset (0m)
              </button>

              <div className="flex gap-1.5">
                <button
                  onClick={() => stepExtreme(50)}
                  disabled={seaLevel >= 1000}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 flex items-center gap-0.5 transition cursor-pointer text-purple-300"
                  title="Increase by 50m milestone"
                >
                  +50m <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => stepExtreme(100)}
                  disabled={seaLevel >= 1000}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 transition cursor-pointer"
                  title="Increase by 100m"
                >
                  +100m
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Auto-Play Timeline Controller */}
      <div className="bg-slate-800/60 rounded-xl p-2.5 border border-slate-700/70 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const nextState = !isPlaying;
              setIsPlaying(nextState);
              if (nextState) {
                onAutoPlayStart?.();
              }
            }}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md ${
              isPlaying
                ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 ring-2 ring-amber-400/40'
                : rangeMode === 'extreme'
                ? 'bg-purple-600 text-white hover:bg-purple-500'
                : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Auto-Play</span>
              </>
            )}
          </button>

          <span className="text-[11px] text-slate-400 hidden sm:inline">
            {isPlaying
              ? rangeMode === 'extreme'
                ? 'Simulating 50m steps...'
                : 'Simulating rise...'
              : rangeMode === 'extreme'
              ? 'Animate 0–1,000m (50m steps)'
              : 'Animate coastal timeline'}
          </span>
        </div>

        {/* Speed Pills */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-0.5 rounded-lg border border-slate-700/80">
          <span className="text-[10px] text-slate-500 px-1 font-semibold flex items-center gap-0.5">
            <Gauge className="w-2.5 h-2.5" />
          </span>
          {([1, 2, 4] as PlaybackSpeed[]).map((spd) => (
            <button
              key={spd}
              onClick={() => setPlaybackSpeed(spd)}
              className={`px-2 py-0.5 rounded text-[11px] font-bold transition cursor-pointer ${
                playbackSpeed === spd
                  ? rangeMode === 'extreme'
                    ? 'bg-purple-500/40 text-purple-200 border border-purple-500/60'
                    : 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>
      </div>

      {/* Benchmark Presets */}
      <div>
        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
          {rangeMode === 'coastal' ? 'Coastal Scenarios' : 'Extreme 50m Milestones (0–1,000m)'}
        </label>
        <div className="grid grid-cols-4 gap-1.5">
          {(rangeMode === 'coastal' ? COASTAL_PRESETS : EXTREME_PRESETS).map((p) => {
            const isActive = seaLevel === p.level;
            return (
              <button
                key={p.level}
                onClick={() => {
                  setIsPlaying(false);
                  onSeaLevelChange(p.level);
                }}
                className={`py-1.5 px-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                  isActive
                    ? rangeMode === 'extreme'
                      ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-500/20'
                      : 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md shadow-cyan-500/20'
                    : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700 border-slate-700'
                }`}
                title={p.desc}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Regional Quick Jumps */}
      <div className="pt-1 border-t border-slate-800">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
          <Navigation className="w-3 h-3 text-cyan-400" />
          <span>Regional Camera Jumps</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {HOTSPOTS.map((spot) => (
            <button
              key={spot.name}
              onClick={() => {
                setIsPlaying(false);
                onSelectHotspot(spot);
              }}
              className="px-2.5 py-1 text-xs rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 text-slate-300 hover:text-white transition cursor-pointer"
            >
              {spot.name}
            </button>
          ))}
        </div>
      </div>
        </>
      )}
    </div>
  );
};
