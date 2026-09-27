import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Lightbulb, Sparkles, Dices, X, GripHorizontal } from 'lucide-react';
import rawFacts from '../data/didYouKnowFacts.json';
import { DidYouKnowFact, FactCategory } from '../types';

const FACTS: DidYouKnowFact[] = rawFacts as DidYouKnowFact[];

const CATEGORY_META: Record<FactCategory, { label: string; icon: string; badgeClass: string }> = {
  geography: {
    label: 'Geography',
    icon: '🌍',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
  },
  population: {
    label: 'Demographics',
    icon: '👥',
    badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40'
  },
  economy: {
    label: 'Global Economy',
    icon: '📈',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40'
  },
  history: {
    label: 'Ancient History',
    icon: '📜',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40'
  },
  heritage: {
    label: 'Cultural Heritage',
    icon: '🏛️',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40'
  },
  deluge: {
    label: 'Planetary Deluge',
    icon: '🌊',
    badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
  }
};

interface DidYouKnowCardProps {
  seaLevel: number;
  onDragStart?: (e: React.PointerEvent) => void;
}

export const DidYouKnowCard: React.FC<DidYouKnowCardProps> = ({ seaLevel, onDragStart }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isMilestoneActive, setIsMilestoneActive] = useState<boolean>(false);
  const lastSeaLevelRef = useRef<number>(seaLevel);

  // Detect matching milestone facts when sea level changes
  useEffect(() => {
    const roundedLevel = Math.round(seaLevel);
    if (roundedLevel !== Math.round(lastSeaLevelRef.current)) {
      lastSeaLevelRef.current = seaLevel;
      const matchingFactIdx = FACTS.findIndex((f) => f.highlightLevel === roundedLevel);
      if (matchingFactIdx !== -1) {
        setCurrentIndex(matchingFactIdx);
        setIsMilestoneActive(true);
        setIsExpanded(true);
        return;
      }
    }
    setIsMilestoneActive(false);
  }, [seaLevel]);

  const currentFact = useMemo(() => {
    return FACTS[currentIndex] || FACTS[0];
  }, [currentIndex]);

  const handleNextFact = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMilestoneActive(false);
    setCurrentIndex((prev) => (prev + 1) % FACTS.length);
  };

  const handleRandomFact = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMilestoneActive(false);
    let newIdx = Math.floor(Math.random() * FACTS.length);
    if (newIdx === currentIndex) {
      newIdx = (newIdx + 1) % FACTS.length;
    }
    setCurrentIndex(newIdx);
  };

  const categoryMeta = CATEGORY_META[currentFact.category] || CATEGORY_META.geography;

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="pointer-events-auto bg-slate-900/90 hover:bg-slate-800 text-amber-300 hover:text-amber-200 border border-amber-500/40 px-3.5 py-2 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-2 text-xs font-bold transition cursor-pointer group animate-fade-in"
        title="Open 'Did You Know?' geographic & historical insights"
      >
        <span className="p-1 rounded-lg bg-amber-500/20 text-amber-400 group-hover:scale-110 transition">
          <Lightbulb className="w-4 h-4 fill-amber-400/30" />
        </span>
        <span>Did You Know?</span>
        <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded-full border border-slate-700">
          52 Facts
        </span>
      </button>
    );
  }

  return (
    <div className="pointer-events-auto w-80 sm:w-96 bg-slate-900/95 backdrop-blur-md border border-slate-700/70 rounded-2xl p-3.5 shadow-2xl transition-all duration-200 animate-fade-in text-slate-100 flex flex-col gap-2.5">
      {/* Header */}
      <div
        onPointerDown={onDragStart}
        className={`flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2 ${onDragStart ? 'cursor-grab active:cursor-grabbing select-none' : ''}`}
      >
        <div className="flex items-center gap-2">
          {onDragStart && (
            <div className="hidden sm:flex text-slate-500 hover:text-slate-300">
              <GripHorizontal className="w-4 h-4" />
            </div>
          )}
          <div className={`p-1.5 rounded-xl ${isMilestoneActive ? 'bg-cyan-500/30 text-cyan-300 animate-pulse' : 'bg-amber-500/20 text-amber-400'}`}>
            <Lightbulb className="w-4 h-4 fill-amber-400/20" />
          </div>
          <div>
            <div className="text-xs font-black tracking-tight text-white flex items-center gap-1.5">
              Did You Know?
              {isMilestoneActive && (
                <span className="text-[9px] uppercase font-bold tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.2 rounded-full">
                  +{Math.round(seaLevel)}m Milestone
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-400">
              Insight {currentIndex + 1} of {FACTS.length}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleRandomFact}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
            title="Random Fact"
          >
            <Dices className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsExpanded(false)}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
            title="Minimize"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Title & Category Badge */}
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold text-slate-100 leading-tight">
          {currentFact.title}
        </h4>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 flex items-center gap-1 ${categoryMeta.badgeClass}`}>
          <span>{categoryMeta.icon}</span>
          <span>{categoryMeta.label}</span>
        </span>
      </div>

      {/* Fact Body Text */}
      <p className="text-[11px] text-slate-300 leading-relaxed bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60 select-text">
        {currentFact.fact}
      </p>

      {/* Footer Controls */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1 text-[10px] text-slate-400">
          <Sparkles className="w-3 h-3 text-cyan-400" />
          <span>Curated geographic insights</span>
        </div>

        <button
          onClick={handleNextFact}
          className="bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 border border-slate-700 px-2.5 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
        >
          <span>Next Fact</span>
          <span>&rarr;</span>
        </button>
      </div>
    </div>
  );
};
