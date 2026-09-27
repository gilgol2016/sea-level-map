import React, { useState, useRef, useEffect } from 'react';
import { X, Sliders, BarChart3, Lightbulb } from 'lucide-react';

export type MobileTab = 'controls' | 'stats' | 'facts';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  children: React.ReactNode;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  children
}) => {
  const [dragOffset, setDragOffset] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const startYRef = useRef<number | null>(null);
  const currentOffsetRef = useRef<number>(0);

  // Reset drag offset when opening/closing
  useEffect(() => {
    if (!isOpen) {
      setDragOffset(0);
      currentOffsetRef.current = 0;
      setIsDragging(false);
      startYRef.current = null;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    startYRef.current = e.clientY;
    setIsDragging(true);
    currentOffsetRef.current = 0;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (startYRef.current === null) return;
    const dy = e.clientY - startYRef.current;
    if (dy > 0) {
      setDragOffset(dy);
      currentOffsetRef.current = dy;
    } else {
      setDragOffset(0);
      currentOffsetRef.current = 0;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (startYRef.current === null) return;
    const finalDy = currentOffsetRef.current;
    startYRef.current = null;
    setIsDragging(false);

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    // If dragged down by more than 60px, close drawer
    if (finalDy > 60) {
      setDragOffset(0);
      currentOffsetRef.current = 0;
      onClose();
    } else {
      setDragOffset(0);
      currentOffsetRef.current = 0;
    }
  };

  const handlePointerCancel = () => {
    startYRef.current = null;
    setIsDragging(false);
    setDragOffset(0);
    currentOffsetRef.current = 0;
  };

  return (
    <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
        style={{
          opacity: dragOffset > 0 ? Math.max(0.2, 1 - dragOffset / 350) : undefined
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Surface */}
      <div
        className="relative z-10 bg-slate-900 border-t border-slate-700/80 rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up"
        style={{
          transform: `translate3d(0, ${dragOffset}px, 0)`,
          transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Top Handle / Grab Bar - Drag down to close */}
        <div
          className="pt-3 pb-2 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          title="Drag down to close"
        >
          <div className="w-12 h-1.5 rounded-full bg-slate-500 hover:bg-slate-400 active:bg-cyan-400 transition-colors" />
        </div>

        {/* Drawer Header with Tabs & Close */}
        <div className="px-4 py-2 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
            <button
              onClick={() => onTabChange('controls')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'controls'
                  ? 'bg-cyan-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Controls</span>
            </button>

            <button
              onClick={() => onTabChange('stats')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'stats'
                  ? 'bg-cyan-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Stats</span>
            </button>

            <button
              onClick={() => onTabChange('facts')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'facts'
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5" />
              <span>Facts</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
            title="Close Drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-4 overflow-y-auto max-h-[calc(85vh-5rem)] text-slate-100 flex flex-col items-center">
          {children}
        </div>
      </div>
    </div>
  );
};
