import React from 'react';
import { Info, X, ShieldAlert, Waves, CheckCircle2 } from 'lucide-react';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl text-slate-100 flex flex-col gap-4 max-h-[85vh] overflow-y-auto custom-scrollbar">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                About Global Sea Level Explorer
              </h3>
              <p className="text-xs text-slate-400">
                Methodology, definitions, and documented limitations
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Core Model Definition */}
        <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
          <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
            <h4 className="font-bold text-white mb-1.5 flex items-center gap-1.5 text-sm">
              <Waves className="w-4 h-4 text-cyan-400" />
              What does "+X meters" mean?
            </h4>
            <p>
              <strong>"+X meters"</strong> represents a hypothetical global ocean sea-level elevation <strong>X meters above today's mean sea level (0 meters)</strong>.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-white mb-2">Inundation Classification Rules:</h4>
            <div className="space-y-2">
              <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong>Newly Submerged Land:</strong> Only currently dry land above today's mean sea level where <code className="text-cyan-300 font-mono">0 &lt; elevation &le; seaLevel</code> is visualized as newly submerged.
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong>Naturally Dry Depressions (Preserved):</strong> Terrestrial land located below sea level today (e.g. Dead Sea depression at -430m, Caspian Sea shore at -28m, Death Valley at -58m, and Dutch polders at -2m to -7m) is <strong>NOT</strong> counted or visualized as newly flooded.
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong>Existing Ocean / Water:</strong> Current baseline oceans are not classified as newly flooded land. At <strong>0m</strong>, there is exactly zero newly submerged land.
                </div>
              </div>
            </div>
          </div>

          {/* Bathtub Model Limitation Callout */}
          <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-3.5 text-amber-200">
            <h4 className="font-bold text-amber-300 mb-1 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              Documented Model Limitations
            </h4>
            <p className="text-[11px] leading-relaxed">
              This application uses a <strong>hydrostatic "bathtub" elevation model</strong> for geographic exploration. It compares bare-ground elevation directly to hypothetical sea levels. It does <strong>not</strong> simulate:
            </p>
            <ul className="list-disc list-inside text-[11px] mt-1.5 space-y-0.5 text-amber-200/90">
              <li>Hydrological connectivity or inland barrier breaches</li>
              <li>Man-made seawalls, dikes, pumps, or storm barriers</li>
              <li>Tidal dynamics, astronomical tides, or wave run-up</li>
              <li>Atmospheric pressure effects or coastal storm surges</li>
            </ul>
          </div>

          <div className="text-[11px] text-slate-400">
            <strong>Elevation Data Source:</strong> AWS Open Data Terrain Tiles (Mapzen Terrarium format) with formula <code className="text-slate-300">(R * 256 + G + B / 256) - 32768</code>. Base map tiles &copy; OpenStreetMap contributors &amp; CARTO.
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition"
          >
            Understood
          </button>
        </div>
      </div>
    </div>
  );
};
